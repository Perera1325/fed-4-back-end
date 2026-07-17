import { clerkClient, getAuth } from "@clerk/express";
import { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../../domain/errors/errors";
import { User } from "../../infrastructure/entities/User";

export const authenticationMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const auth = getAuth(req);
    if (!auth.userId) {
      throw new UnauthorizedError("Unauthorized");
    }

    // Normally a Clerk webhook (user.created) provisions the local User
    // record. If that webhook isn't configured yet, or hasn't fired for
    // some reason, auto-provision the User here on first authenticated
    // request instead of failing every downstream route with "User not
    // found".
    const existingUser = await User.findOne({ clerkUserId: auth.userId });
    if (!existingUser) {
      const clerkUser = await clerkClient.users.getUser(auth.userId);
      const primaryEmail =
        clerkUser.emailAddresses.find(
          (e) => e.id === clerkUser.primaryEmailAddressId
        )?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress;

      const role =
        (clerkUser.publicMetadata as { role?: string })?.role === "admin"
          ? "admin"
          : "staff";

      await User.create({
        firstName: clerkUser.firstName || "",
        lastName: clerkUser.lastName || "",
        email: primaryEmail,
        clerkUserId: auth.userId,
        role,
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
