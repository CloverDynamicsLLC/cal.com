import { NextApiRequest, NextApiResponse } from "next";

import prisma from "@lib/prisma";

const employerIdPrefix = process.env.EMPLOYER_ID_PREFIX || "";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).end();
  }

  const { employerId } = req.query;
  const user = await prisma.user.findUnique({
    where: {
      id: Number.parseInt(employerId as string),
    },
    select: {
      email: true,
    },
  });

  if (!employerId || !user) {
    return res.status(400).json({ message: "Couldn't find an account for this email" });
  }

  res.status(200).json({
    email: user.email,
    password: process.env.EMPLOYER_PASSWORD || "123456",
  });
}
