"use client";

import { useActionState } from "react";
import { submitContact, type ContactFormState } from "./_actions";

const initial: ContactFormState = { status: "idle", message: "" };

export default function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, initial);

  if (state.status === "success") {
    return (
      <div className="border border-[rgba(0,232,120,0.25)] bg-[rgba(0,232,120,0.06)] rounded-[10px] p-6 text-center">
        <div className="text-[32px] mb-3">✓</div>
        <p className="text-white font-medium text-[16px]">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-[13px] text-[#8a919e] mb-2">
          Full name <span className="text-[#ff4d4d]">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          placeholder="Rahul Sharma"
          className="w-full bg-[#141619] border border-[#1f2228] rounded-[8px] px-4 py-3 text-white text-[15px] placeholder:text-[#3d4450] focus:outline-none focus:border-[rgba(0,232,120,0.4)] transition-colors"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-[13px] text-[#8a919e] mb-2">
          Work email <span className="text-[#ff4d4d]">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="rahul@yourcompany.com"
          className="w-full bg-[#141619] border border-[#1f2228] rounded-[8px] px-4 py-3 text-white text-[15px] placeholder:text-[#3d4450] focus:outline-none focus:border-[rgba(0,232,120,0.4)] transition-colors"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-[13px] text-[#8a919e] mb-2">
          Phone number <span className="text-[#ff4d4d]">*</span>
        </label>
        <div className="flex gap-2">
          <div className="flex items-center bg-[#141619] border border-[#1f2228] rounded-[8px] px-3 text-[#8a919e] text-[15px] shrink-0">
            +91
          </div>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            placeholder="98765 43210"
            maxLength={11}
            className="flex-1 bg-[#141619] border border-[#1f2228] rounded-[8px] px-4 py-3 text-white text-[15px] placeholder:text-[#3d4450] focus:outline-none focus:border-[rgba(0,232,120,0.4)] transition-colors"
          />
        </div>
      </div>

      <div>
        <label htmlFor="message" className="block text-[13px] text-[#8a919e] mb-2">
          Message <span className="text-[#3d4450]">(optional)</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          placeholder="Tell us about your business or what you'd like to know..."
          className="w-full bg-[#141619] border border-[#1f2228] rounded-[8px] px-4 py-3 text-white text-[15px] placeholder:text-[#3d4450] focus:outline-none focus:border-[rgba(0,232,120,0.4)] transition-colors resize-none"
        />
      </div>

      {state.status === "error" && (
        <p className="text-[#ff4d4d] text-[13px]">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 rounded-[8px] text-[15px] font-medium bg-[rgba(0,232,120,0.1)] border border-[rgba(0,232,120,0.25)] text-[#00e878] hover:bg-[rgba(0,232,120,0.16)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
