import { Resend } from "resend";
import { env } from "../config/env";
import { logger } from "../config/logger";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendPasswordResetEmail(
  toEmail: string,
  userName: string,
  resetToken: string
): Promise<void> {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  if (!resend) {
    logger.info(`[DEV] Password reset link for ${toEmail}: ${resetUrl}`);
    return;
  }

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: toEmail,
    subject: "Reset your HomeSync password",
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #0f5238;">Reset your password</h2>
        <p>Hi ${userName},</p>
        <p>Click the button below to reset your HomeSync password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="
          display: inline-block;
          background: #0f5238;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          margin: 16px 0;
        ">Reset Password</a>
        <p style="color: #6b7280; font-size: 14px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}
