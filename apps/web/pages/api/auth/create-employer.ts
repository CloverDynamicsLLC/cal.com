import { NextApiRequest, NextApiResponse } from "next";
import { v4 } from "uuid";

import { hashPassword } from "@lib/auth";
import prisma from "@lib/prisma";
import slugify from "@lib/slugify";
import { WEBHOOK_TRIGGER_EVENTS } from "@lib/webhooks/constants";

import { IdentityProvider } from ".prisma/client";

const getEmployerEmail = (id: number) => `employer_${id}@coach.com`;
const employerPassword = process.env.EMPLOYER_PASSWORD || "123456";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const { employerId, email, employerName } = req.body;

  const username = slugify(employerName);

  //const email = getEmployerEmail(employerId);
  const hashedPassword = await hashPassword(employerPassword);

  const existingUser = await prisma.user.findFirst({ where: { email } });

  if (existingUser) {
    return res.status(422).json({ message: "employer_reg_duplicate" });
  }

  const user = await prisma.user.create({
    data: {
      name: employerName,
      username,
      email,
      password: hashedPassword,
      emailVerified: new Date(Date.now()),
      identityProvider: IdentityProvider.CAL,
      completedOnboarding: true,
      locale: "en",
      plan: "PRO",
    },
  });
  console.log(user);
  await prisma.eventType.create({
    data: {
      userId: user.id,
      users: { connect: { id: user.id } },
      title: "Coaching",
      slug: "default-book",
      length: 60,
      disableGuests: true,
      requiresConfirmation: true,
    },
  });

  const webhookUrl = process.env.WEBHOOK_API_URL;

  webhookUrl &&
    (await prisma.webhook.createMany({
      data: [
        {
          id: v4(),
          userId: user.id,
          subscriberUrl: `${webhookUrl}/api/calcom/appointments/created`,
          eventTriggers: "BOOKING_CREATED",
        },
        {
          id: v4(),
          userId: user.id,
          subscriberUrl: `${webhookUrl}/api/calcom/appointments/cancelled`,
          eventTriggers: "BOOKING_CANCELLED",
        },
        {
          id: v4(),
          userId: user.id,
          subscriberUrl: `${webhookUrl}/api/calcom/appointments/rescheduled`,
          eventTriggers: "BOOKING_RESCHEDULED",
        },
        {
          id: v4(),
          userId: user.id,
          subscriberUrl: `${webhookUrl}/api/calcom/appointments/confirmed`,
          eventTriggers: "BOOKING_CONFIRMED",
        },
        {
          id: v4(),
          userId: user.id,
          subscriberUrl: `${webhookUrl}/api/calcom/appointments/rejected`,
          eventTriggers: "BOOKING_REJECTED",
        },
        {
          id: v4(),
          userId: user.id,
          subscriberUrl: `${webhookUrl}/api/calcom/appointments/rescheduled/customerConfirmed`,
          eventTriggers: "RESCHEDULED_BOOKING_CUSTOMER_CONFIRMED",
        },
        {
          id: v4(),
          userId: user.id,
          subscriberUrl: `${webhookUrl}/api/calcom/appointments/rescheduled/coachConfirmed`,
          eventTriggers: "RESCHEDULED_BOOKING_COACH_CONFIRMED",
        },
        {
          id: v4(),
          userId: user.id,
          subscriberUrl: `${webhookUrl}/api/calcom/appointments/confirmed`,
          eventTriggers: "BOOKING_CONFIRMED",
        },
        {
          id: v4(),
          userId: user.id,
          subscriberUrl: `${webhookUrl}/api/calcom/appointments/rejected`,
          eventTriggers: "BOOKING_REJECTED",
        },
      ],
    }));

  res.status(201).json({
    calUserId: user.id,
    calUserName: user.name,
  });
}
