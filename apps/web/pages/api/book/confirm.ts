import { Prisma, User, Booking, SchedulingType, BookingStatus } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { refund } from "@ee/lib/stripe/server";

import { asStringOrNull } from "@lib/asStringOrNull";
import { getSession } from "@lib/auth";
import { sendDeclinedEmails } from "@lib/emails/email-manager";
import { sendScheduledEmails } from "@lib/emails/email-manager";
import EventManager from "@lib/events/EventManager";
import { CalendarEvent, AdditionInformation } from "@lib/integrations/calendar/interfaces/Calendar";
import logger from "@lib/logger";
import prisma from "@lib/prisma";
import { BookingConfirmBody } from "@lib/types/booking";

import { getTranslation } from "@server/lib/i18n";
import getSubscribers from "@lib/webhooks/subscriptions";
import sendPayload from "@lib/webhooks/sendPayload";

const authorized = async (
  currentUser: Pick<User, "id">,
  booking: Pick<Booking, "eventTypeId" | "userId">
) => {
  // if the organizer
  if (booking.userId === currentUser.id) {
    return true;
  }
  const eventType = await prisma.eventType.findUnique({
    where: {
      id: booking.eventTypeId || undefined,
    },
    select: {
      schedulingType: true,
      users: true,
    },
  });
  if (
    eventType?.schedulingType === SchedulingType.COLLECTIVE &&
    eventType.users.find((user) => user.id === currentUser.id)
  ) {
    return true;
  }
  return false;
};

const log = logger.getChildLogger({ prefix: ["[api] book:user"] });

const triggerWebHook = async (webhook, user, event, bookingId, reqBody) => {
  const subscribers = await getSubscribers(user.id, webhook);
  const promises = subscribers.map((sub) =>
    sendPayload(
      webhook,
      new Date().toISOString(),
      sub.subscriberUrl,
      {
        ...event,
        bookingId,
        metadata: reqBody.metadata,
      },
      sub.payloadTemplate
    ).catch((e) => {
      console.error(`Error executing webhook for event: ${webhook}, URL: ${sub.subscriberUrl}`, e);
    })
  );
  await Promise.all(promises);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req: req });
  if (!session?.user?.id) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const reqBody = req.body as BookingConfirmBody;
  const bookingId = reqBody.id;

  if (!bookingId) {
    return res.status(400).json({ message: "bookingId missing" });
  }

  const currentUser = await prisma.user.findFirst({
    where: {
      id: session.user.id,
    },
    select: {
      id: true,
      credentials: {
        orderBy: { id: "desc" as Prisma.SortOrder },
      },
      timeZone: true,
      email: true,
      name: true,
      username: true,
      destinationCalendar: true,
      locale: true,
    },
  });

  if (!currentUser) {
    return res.status(404).json({ message: "User not found" });
  }

  const tOrganizer = await getTranslation(currentUser.locale ?? "en", "common");

  if (req.method === "PATCH") {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
      },
      select: {
        agreedFee: true,
        title: true,
        description: true,
        startTime: true,
        endTime: true,
        confirmed: true,
        rejected: true,
        attendees: true,
        eventTypeId: true,
        location: true,
        userId: true,
        id: true,
        uid: true,
        payment: true,
        destinationCalendar: true,
        status: true,
      },
    });

    if (!booking) {
      return res.status(404).json({ message: "booking not found" });
    }

    if (!(await authorized(currentUser, booking))) {
      return res.status(401).end();
    }

    if (booking.confirmed) {
      return res.status(400).json({ message: "booking already confirmed" });
    }

    const attendeesListPromises = booking.attendees.map(async (attendee) => {
      return {
        name: attendee.name,
        email: attendee.email,
        timeZone: attendee.timeZone,
        language: {
          translate: await getTranslation(attendee.locale ?? "en", "common"),
          locale: attendee.locale ?? "en",
        },
      };
    });

    const attendeesList = await Promise.all(attendeesListPromises);

    const evt: CalendarEvent = {
      type: booking.title,
      title: booking.title,
      description: booking.description,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime.toISOString(),
      agreedFee: booking.agreedFee,
      organizer: {
        email: currentUser.email,
        name: currentUser.name || "Unnamed",
        timeZone: currentUser.timeZone,
        language: { translate: tOrganizer, locale: currentUser.locale ?? "en" },
      },
      attendees: attendeesList,
      location: booking.location ?? "",
      uid: booking.uid,
      destinationCalendar: booking?.destinationCalendar || currentUser.destinationCalendar,
      status: booking.status,
      confirmed: booking.confirmed,
      rejected: booking.rejected,
    };

    if (reqBody.confirmed) {
      const eventManager = new EventManager(currentUser);
      const scheduleResult = await eventManager.create(evt);

      const results = scheduleResult.results;

      if (results.length > 0 && results.every((res) => !res.success)) {
        const error = {
          errorCode: "BookingCreatingMeetingFailed",
          message: "Booking failed",
        };

        log.error(`Booking ${currentUser.username} failed`, error, results);
      } else {
        const metadata: AdditionInformation = {};

        if (results.length) {
          // TODO: Handle created event metadata more elegantly
          metadata.hangoutLink = results[0].createdEvent?.hangoutLink;
          metadata.conferenceData = results[0].createdEvent?.conferenceData;
          metadata.entryPoints = results[0].createdEvent?.entryPoints;
        }
        await sendScheduledEmails({ ...evt, additionInformation: metadata });
      }

      const confirmedBooking = await prisma.booking.update({
        where: {
          id: bookingId,
        },
        data: {
          confirmed: true,
          references: {
            create: scheduleResult.referencesToCreate,
          },
        },
      });
      const confirmedEvent: CalendarEvent = {
        ...evt,
        status: confirmedBooking.status,
      };

      await triggerWebHook("BOOKING_CONFIRMED", session.user, confirmedEvent, booking.uid, reqBody);

      res.status(204).end();
    } else {
      await refund(booking, evt);
      const rejectionReason = asStringOrNull(req.body.reason) || "";
      evt.rejectionReason = rejectionReason;
      const rejectedBooking = await prisma.booking.update({
        where: {
          id: bookingId,
        },
        data: {
          rejected: true,
          status: BookingStatus.REJECTED,
          rejectionReason: rejectionReason,
        },
      });

      const rejectedEvent: CalendarEvent = {
        ...evt,
        status: rejectedBooking.status,
      };

      await triggerWebHook("BOOKING_REJECTED", session.user, rejectedEvent, booking.uid, reqBody);
      await sendDeclinedEmails(evt);

      res.status(204).end();
    }
  }
}
