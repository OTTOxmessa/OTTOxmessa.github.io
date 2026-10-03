import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bearer, makeApp, resetDatabase, signup } from "./helpers";

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => {
  await resetDatabase();
  ctx = await makeApp();
});
afterAll(() => ctx.close());

describe("register and login", () => {
  it("registers, creates a first org owned by the user, and answers /me", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "  Somchai@Example.COM ",
        password: "correct-horse-battery",
        name: "สมชาย",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe("somchai@example.com");
    expect(body.orgs).toEqual([{ id: expect.any(String), name: "ร้านของสมชาย", role: "owner" }]);
    expect(body.expiresIn).toBe(900);
    const me = await ctx.app.inject({
      method: "GET",
      url: "/me",
      headers: bearer(body.accessToken),
    });
    expect(me.json().user.email).toBe("somchai@example.com");
  });

  it("rejects duplicate emails (any case), weak passwords and bad emails", async () => {
    const dup = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "SOMCHAI@example.com", password: "correct-horse-battery" },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("email_taken");
    const weak = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "x@example.com", password: "short" },
    });
    expect(weak.statusCode).toBe(400);
    expect(weak.json().error.details[0].message).toMatch("10");
    const bad = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "nope", password: "correct-horse-battery" },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("logs in with the right password only, with the same message for unknown emails", async () => {
    const ok = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "somchai@example.com", password: "correct-horse-battery" },
    });
    expect(ok.statusCode).toBe(200);
    const wrong = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "somchai@example.com", password: "wrong-password!!" },
    });
    const unknown = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.com", password: "wrong-password!!" },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrong.json());
  });

  it("requires a valid bearer token", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/me" })).statusCode).toBe(401);
    expect(
      (await ctx.app.inject({ method: "GET", url: "/me", headers: bearer("abc.def.ghi") }))
        .statusCode,
    ).toBe(401);
  });
});

describe("refresh token rotation", () => {
  it("rotates on every use and kills the whole family when an old token is replayed", async () => {
    const s = await signup(ctx.app);
    const r1 = await ctx.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: s.refresh },
    });
    expect(r1.statusCode).toBe(200);
    const t2 = r1.json().refreshToken;
    expect(t2).not.toBe(s.refresh);
    // จำลองว่าเวลาผ่านไปเกินช่วงผ่อนผัน แล้วมีคนเอา token เก่ามาใช้ (เช่นถูกขโมยไป)
    // → ถูกปฏิเสธ และ token ใหม่ของตระกูลเดียวกันก็ใช้ไม่ได้ด้วย
    await ctx.client`update refresh_tokens set revoked_at = now() - interval '1 minute' where revoked_at is not null`;
    const replay = await ctx.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: s.refresh },
    });
    expect(replay.json().error.code).toBe("refresh_reused");
    const after = await ctx.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: t2 },
    });
    expect(after.statusCode).toBe(401);
  });

  it("two tabs refreshing at the same moment both stay signed in (short grace window)", async () => {
    const s = await signup(ctx.app);
    const results = await Promise.all(
      [1, 2].map(() =>
        ctx.app.inject({
          method: "POST",
          url: "/auth/refresh",
          payload: { refreshToken: s.refresh },
        }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    const [a, b] = results.map((r) => r.json().refreshToken);
    expect(a).not.toBe(b);
    for (const t of [a, b])
      expect(
        (
          await ctx.app.inject({
            method: "POST",
            url: "/auth/refresh",
            payload: { refreshToken: t },
          })
        ).statusCode,
      ).toBe(200);
  });

  it("logout revokes the session", async () => {
    const s = await signup(ctx.app);
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: "/auth/logout",
          payload: { refreshToken: s.refresh },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: "/auth/refresh",
          payload: { refreshToken: s.refresh },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("changing the password signs out every device", async () => {
    const s = await signup(ctx.app);
    const res = await ctx.app.inject({
      method: "POST",
      url: "/me/password",
      headers: bearer(s.token),
      payload: { currentPassword: "correct-horse-battery", newPassword: "another-long-password" },
    });
    expect(res.statusCode).toBe(204);
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: "/auth/refresh",
          payload: { refreshToken: s.refresh },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email: s.email, password: "another-long-password" },
        })
      ).statusCode,
    ).toBe(200);
  });
});

describe("organizations and roles", () => {
  it("hides other people's orgs and enforces owner/staff/viewer", async () => {
    const owner = await signup(ctx.app, "เจ้าของ");
    const staff = await signup(ctx.app, "พนักงาน");
    const stranger = await signup(ctx.app, "คนนอก");
    // คนนอกเห็นเป็น 404 ไม่ใช่ 403 — ไม่รู้ด้วยซ้ำว่าร้านนี้มีอยู่
    expect(
      (
        await ctx.app.inject({
          method: "GET",
          url: `/orgs/${owner.orgId}`,
          headers: bearer(stranger.token),
        })
      ).statusCode,
    ).toBe(404);
    const add = await ctx.app.inject({
      method: "POST",
      url: `/orgs/${owner.orgId}/members`,
      headers: bearer(owner.token),
      payload: { email: staff.email, role: "staff" },
    });
    expect(add.statusCode).toBe(201);
    expect(
      (
        await ctx.app.inject({
          method: "GET",
          url: `/orgs/${owner.orgId}`,
          headers: bearer(staff.token),
        })
      ).json().role,
    ).toBe("staff");
    const patchByStaff = await ctx.app.inject({
      method: "PATCH",
      url: `/orgs/${owner.orgId}`,
      headers: bearer(staff.token),
      payload: { name: "แอบแก้" },
    });
    expect(patchByStaff.statusCode).toBe(403);
    const patch = await ctx.app.inject({
      method: "PATCH",
      url: `/orgs/${owner.orgId}`,
      headers: bearer(owner.token),
      payload: {
        name: "OTTO Studio",
        vatRegistered: true,
        prefixes: { QT: "Q", INV: "IV", RC: "R" },
      },
    });
    expect(patch.json()).toMatchObject({
      name: "OTTO Studio",
      vatRegistered: true,
      prefixes: { INV: "IV" },
    });
    const badTax = await ctx.app.inject({
      method: "PATCH",
      url: `/orgs/${owner.orgId}`,
      headers: bearer(owner.token),
      payload: { taxId: "1234567890123" },
    });
    expect(badTax.statusCode).toBe(400);
    const members = await ctx.app.inject({
      method: "GET",
      url: `/orgs/${owner.orgId}/members`,
      headers: bearer(staff.token),
    });
    expect(members.json()).toHaveLength(2);
  });

  it("never leaves an org without an owner", async () => {
    const owner = await signup(ctx.app);
    const demote = await ctx.app.inject({
      method: "PATCH",
      url: `/orgs/${owner.orgId}/members/${owner.userId}`,
      headers: bearer(owner.token),
      payload: { role: "staff" },
    });
    expect(demote.statusCode).toBe(409);
    const leave = await ctx.app.inject({
      method: "DELETE",
      url: `/orgs/${owner.orgId}/members/${owner.userId}`,
      headers: bearer(owner.token),
    });
    expect(leave.statusCode).toBe(409);
  });

  it("rejects garbage ids without a server error", async () => {
    const s = await signup(ctx.app);
    expect(
      (await ctx.app.inject({ method: "GET", url: "/orgs/not-a-uuid", headers: bearer(s.token) }))
        .statusCode,
    ).toBe(400);
  });
});

describe("rate limiting", () => {
  it("blocks repeated login attempts for the same email", async () => {
    const limited = await makeApp({ RATE_LIMIT: "true" });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await limited.app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email: "victim@example.com", password: `guess-${i}-xxxxx` },
        });
        codes.push(res.statusCode);
      }
      expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
      expect(codes.slice(10)).toEqual([429, 429]);
      // อีเมลอื่นจาก IP เดียวกันยังลองได้ (ไม่ล็อกทั้งร้าน)
      const other = await limited.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "other@example.com", password: "whatever-pass" },
      });
      expect(other.statusCode).toBe(401);
    } finally {
      await limited.close();
    }
  });
});

describe("demo accounts", () => {
  it("creates a private, pre-filled shop that works with the normal API", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/auth/demo" });
    expect(res.statusCode).toBe(201);
    const d = res.json();
    expect(d.demo).toBe(true);
    const org = d.orgs[0].id;
    const docs = (
      await ctx.app.inject({
        method: "GET",
        url: `/orgs/${org}/documents`,
        headers: bearer(d.accessToken),
      })
    ).json();
    expect(docs.length).toBeGreaterThan(15);
    expect(docs.some((x: { status: string }) => x.status === "overdue")).toBe(true);
    // ผู้ทดลองสองคนไม่เห็นข้อมูลของกันและกัน
    const other = (await ctx.app.inject({ method: "POST", url: "/auth/demo" })).json();
    expect(other.orgs[0].id).not.toBe(org);
    expect(
      (
        await ctx.app.inject({
          method: "GET",
          url: `/orgs/${org}/documents`,
          headers: bearer(other.accessToken),
        })
      ).statusCode,
    ).toBe(404);
  });

  it("removes demo accounts older than a day", async () => {
    const d = (await ctx.app.inject({ method: "POST", url: "/auth/demo" })).json();
    await ctx.client`update users set created_at = now() - interval '2 days' where id = ${d.user.id}`;
    await ctx.app.inject({ method: "POST", url: "/auth/demo" });
    const [u] = await ctx.client`select count(*)::int as n from users where id = ${d.user.id}`;
    const [o] =
      await ctx.client`select count(*)::int as n from organizations where id = ${d.orgs[0].id}`;
    expect([u!.n, o!.n]).toEqual([0, 0]);
  });
});
