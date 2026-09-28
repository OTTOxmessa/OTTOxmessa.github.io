"use client";

import { useState, type FormEvent } from "react";

const TOPICS = [
  { id: "internship", th: "ฝึกงาน / ร่วมงาน", en: "Internship / job" },
  { id: "project", th: "ชวนทำโปรเจกต์", en: "Project collaboration" },
  { id: "question", th: "สอบถามเกี่ยวกับผลงาน", en: "Question about my work" },
  { id: "other", th: "อื่นๆ", en: "Something else" },
];

/**
 * เว็บเป็น static (GitHub Pages) จึงไม่มี server รับฟอร์ม
 * ฟอร์มนี้จะเปิดแอปอีเมลของผู้ใช้พร้อมข้อความที่กรอกไว้ให้แทน
 */
export function ContactForm({ email }: { email: string }) {
  const [error, setError] = useState<"" | "missing">("");
  const [copied, setCopied] = useState(false);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      setError("missing");
      form.querySelector<HTMLElement>(":invalid")?.focus();
      return;
    }
    setError("");
    const data = new FormData(form);
    const en = document.documentElement.dataset.lang === "en";
    const topic = TOPICS.find((t) => t.id === data.get("topic"));
    const subject = `[Portfolio] ${topic ? (en ? topic.en : topic.th) : ""} — ${data.get("name")}`;
    const body = `${data.get("message")}\n\n— ${data.get("name")} (${data.get("from")})`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked — the address is visible anyway */
    }
  }

  return (
    <form className="contact-form" onSubmit={submit} noValidate aria-describedby="form-note">
      <div className="field">
        <label htmlFor="cf-name"><span className="i18n-th">ชื่อ</span><span className="i18n-en">Name</span></label>
        <input id="cf-name" name="name" autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor="cf-from"><span className="i18n-th">อีเมลของคุณ</span><span className="i18n-en">Your email</span></label>
        <input id="cf-from" name="from" type="email" autoComplete="email" inputMode="email" required />
      </div>
      <div className="field field--full">
        <label htmlFor="cf-topic"><span className="i18n-th">เรื่อง</span><span className="i18n-en">Topic</span></label>
        <select id="cf-topic" name="topic" defaultValue="internship">
          {TOPICS.map((t) => (
            <option key={t.id} value={t.id}>{t.th} / {t.en}</option>
          ))}
        </select>
      </div>
      <div className="field field--full">
        <label htmlFor="cf-message"><span className="i18n-th">ข้อความ</span><span className="i18n-en">Message</span></label>
        <textarea id="cf-message" name="message" rows={5} required minLength={10} />
      </div>

      <p className="form-error" role="alert">
        {error === "missing" && (
          <>
            <span className="i18n-th">กรุณากรอกช่องที่ยังว่างหรือไม่ถูกต้อง (ข้อความอย่างน้อย 10 ตัวอักษร)</span>
            <span className="i18n-en">Please fill in the empty or invalid fields (message: at least 10 characters).</span>
          </>
        )}
      </p>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          <span className="i18n-th">ส่งข้อความ</span><span className="i18n-en">Send message</span>
        </button>
        <button type="button" className="btn-link" onClick={copy}>
          {copied ? (
            <><span className="i18n-th">คัดลอกแล้ว ✓</span><span className="i18n-en">Copied ✓</span></>
          ) : (
            <><span className="i18n-th">หรือคัดลอกอีเมล →</span><span className="i18n-en">or copy my email →</span></>
          )}
        </button>
      </div>
      <p className="form-note" id="form-note">
        <span className="i18n-th">กดส่งแล้วแอปอีเมลของคุณจะเปิดขึ้นพร้อมข้อความนี้</span>
        <span className="i18n-en">Sending opens your email app with this message filled in.</span>
      </p>
    </form>
  );
}
