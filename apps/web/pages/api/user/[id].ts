import { pick } from "lodash";
import type { NextApiRequest, NextApiResponse } from "next";

import { getSession } from "@lib/auth";
import prisma from "@lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {


  if (req.method === "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  if (req.method === "PATCH") {
    const session = await getSession({ req });

    if (!session?.user.id) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const userIdQuery = req.query?.id ?? null;
    const userId = Array.isArray(userIdQuery) ? parseInt(userIdQuery.pop() || "") : parseInt(userIdQuery);

    const authenticatedUser = await prisma.user.findFirst({
      rejectOnNotFound: true,
      where: {
        id: session.user.id,
      },
      select: {
        id: true,
      },
    });

    if (userId !== authenticatedUser.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: authenticatedUser.id,
      },
      data: {
        ...pick(req.body.data, [
          "username",
          "name",
          "avatar",
          "timeZone",
          "weekStart",
          "hideBranding",
          "theme",
          "completedOnboarding",
        ]),
        bio: req.body.description ?? req.body.data?.bio,
      },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        emailVerified: true,
        bio: true,
        avatar: true,
        timeZone: true,
        weekStart: true,
        startTime: true,
        endTime: true,
        bufferTime: true,
        hideBranding: true,
        theme: true,
        createdDate: true,
        plan: true,
        completedOnboarding: true,
      },
    });
    return res.status(200).json({ message: "User Updated", data: updatedUser });
  }

  if (req.method == "DELETE") {
    const userIdQuery = req.query?.id ?? null;
    const userId = Array.isArray(userIdQuery) ? parseInt(userIdQuery.pop() || "") : parseInt(userIdQuery);

    if (!userId) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    try {
      await prisma.user.delete({
        where: { id: userId },
      });
      return res.status(204).end();
    } catch (error) {
      return res
        .status(500)
        .json({ message: `Error while deleting a user. Maybe user with id ${userId} does not exist` });
    }
  }
}
