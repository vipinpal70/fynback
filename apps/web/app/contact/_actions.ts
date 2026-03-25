"use server";

export interface ContactFormState {
  status: "idle" | "success" | "error";
  message: string;
}

export async function submitContact(
  _prev: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const message = (formData.get("message") as string)?.trim();

  if (!name || !email || !phone) {
    return { status: "error", message: "Name, email, and phone are required." };
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) {
    return { status: "error", message: "Please enter a valid email address." };
  }

  const phoneRe = /^[6-9]\d{9}$/;
  if (!phoneRe.test(phone.replace(/\s/g, ""))) {
    return { status: "error", message: "Please enter a valid 10-digit Indian mobile number." };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: "FynBack Contact <noreply@fynback.com>",
      to: "hello@fynback.com",
      subject: `New contact from ${name}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        ${message ? `<p><strong>Message:</strong> ${message}</p>` : ""}
      `,
    });

    return {
      status: "success",
      message: "Thanks! We'll get back to you within 1 business day.",
    };
  } catch (err) {
    console.error("[Contact Form]", err);
    return {
      status: "error",
      message: "Something went wrong. Please email us directly at hello@fynback.com",
    };
  }
}
