import { NextApiRequest, NextApiResponse } from "next";

import prisma from "@lib/prisma";
import sendPayload from "@lib/webhooks/sendPayload";
import getSubscribers from "@lib/webhooks/subscriptions";

function attendeeExists(attendees, attendeeEmail) {
  for (const attendee of attendees) {
    if (attendee.email === attendeeEmail) {
      return true;
    }
  }
  return false;
}

async function getBooking(bookingId) {
  return prisma.booking.findFirst({
    where: {
      uid: bookingId,
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
}

async function setCustomerConfirmed(bookingId){
  await prisma.booking.update({
    where: {
      uid: bookingId,
    },
    data: {
      customerConfirmed: true,
    },
  });
}

const triggerWebHook = async (webhook, user, event, bookingId) => {
  const subscribers = await getSubscribers(user.id, webhook);
  const promises = subscribers.map((sub) =>
    sendPayload(
      webhook,
      new Date().toISOString(),
      sub.subscriberUrl,
      {
        ...event,
        bookingId,
      },
      sub.payloadTemplate
    ).catch((e) => {
      console.error(`Error executing webhook for event: ${webhook}, URL: ${sub.subscriberUrl}`, e);
    })
  );
  await Promise.all(promises);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    const { email, appointmentId } = req.body;

    const booking = await getBooking(appointmentId);

    if (!booking) {
      return res.status(404).json({ message: "Requested booking not found" });
    }

    const isAttendeeExists = attendeeExists(booking.attendees, email);

    if (!isAttendeeExists) {
      return res.status(404).json({ message: `Attendee with email ${email} does not exist` });
    }

    await setCustomerConfirmed(appointmentId);
    //await triggerWebHook("RESCHEDULED_BOOKING_USER_CONFIRMED", booking.userId, { customerConfirmed: true }, bookingId);
    res.status(204).end();
  }
}
