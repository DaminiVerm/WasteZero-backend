import nodemailer from "nodemailer"

const sendEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"WasteZero Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "WasteZero OTP Verification",
      html: `
        <div style="font-family: Arial; padding: 20px;">
          <h2>🔐 OTP Verification</h2>
          <p>Your OTP code is:</p>
          <h1 style="color:#2e7d32; font-size: 32px; letter-spacing: 5px; font-family: monospace;"><b>${otp}</b></h1>
          <p>This OTP will expire in <b>10 minutes</b>.</p>
          <p>If you did not request this, please ignore this email.</p>
          <br/>
          <small>WasteZero Team</small>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    console.log("✅ OTP email sent successfully");

  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw new Error("Email could not be sent");
  }
};

export default sendEmail;
