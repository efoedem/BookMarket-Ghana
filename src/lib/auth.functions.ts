import { createServerFn } from "@tanstack/react-start";

type SessionPayload = {
  access_token: string;
  refresh_token: string;
};

type AuthResult = { ok: true; session: SessionPayload } | { ok: false; error: string };

type SignUpInput = {
  username: string;
  email: string;
  phone: string;
  password: string;
  fullName?: string;
  schoolId: string;
  departmentId: string;
  level: string;
};

type SignInInput = {
  identifier: string;
  password: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  return `+${digits}`;
}

function validateSignUp(data: { username: string; email: string; phone: string; password: string; schoolId: string; departmentId: string; level: string }): string | null {
  const { username, email, phone, password } = data;
  const input = data;
    if (!/^[a-z0-9_.]{3,30}$/.test(username)) {
      return ("Username must be 3-30 characters: letters, numbers, dot or underscore.");
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 255) {
      return ("Please enter a valid email address.");
    }
    if (!/^\+\d{9,15}$/.test(phone)) {
      return ("Please enter a valid phone number, e.g. 0551234567.");
    }
    if (password.length < 8 || password.length > 72) {
      return ("Password must be at least 8 characters.");
    }
    if (!clean(input.schoolId) || !clean(input.departmentId) || !clean(input.level)) {
      return ("Please select your school, department and level.");
    }

  return null;
}

export const signUpStudent = createServerFn({ method: "POST" })
  .inputValidator((input: SignUpInput) => {
    const username = clean(input.username).toLowerCase();
    const email = clean(input.email).toLowerCase();
    const phone = normalizePhone(clean(input.phone));
    const password = clean(input.password);

    return {
      username,
      email,
      phone,
      password,
      fullName: clean(input.fullName).slice(0, 120) || null,
      schoolId: clean(input.schoolId),
      departmentId: clean(input.departmentId),
      level: clean(input.level),
    };
  })
  .handler(async ({ data }): Promise<AuthResult> => {
    const invalid = validateSignUp(data);
    if (invalid) return { ok: false, error: invalid };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: taken, error: takenError } = await supabaseAdmin
      .from("profiles")
      .select("username, phone")
      .or(`username.eq.${data.username},phone.eq.${data.phone}`)
      .limit(1);

    if (takenError) {
      console.error("signUpStudent lookup failed", takenError);
      return { ok: false, error: "We could not create your account. Please try again." };
    }
    if (taken && taken.length > 0) {
      const row = taken[0]!;
      return {
        ok: false,
        error:
          row.username === data.username
            ? "That username is already taken."
            : "That phone number is already registered.",
      };
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      phone_confirm: false,
      user_metadata: { username: data.username, full_name: data.fullName },
    });

    if (createError || !created.user) {
      const message = createError?.message ?? "";
      console.error("signUpStudent createUser failed", createError);
      return {
        ok: false,
        error: /already|registered|exists/i.test(message)
          ? "An account already exists with that email address."
          : /weak|easy to guess|pwned/i.test(message)
            ? "That password is too easy to guess. Please choose a stronger one."
            : "We could not create your account. Please try again.",
      };
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: created.user.id,
      username: data.username,
      email: data.email,
      phone: data.phone,
      full_name: data.fullName,
      school_id: data.schoolId,
      department_id: data.departmentId,
      level: data.level,
    });

    if (profileError) {
      console.error("signUpStudent profile insert failed", profileError);
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return {
        ok: false,
        error: /username/.test(profileError.message)
          ? "That username is already taken."
          : /phone/.test(profileError.message)
            ? "That phone number is already registered."
            : "We could not save your details. Please try again.",
      };
    }

    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "student" });

    return signInWithEmail(data.email, data.password);
  });

export const signInStudent = createServerFn({ method: "POST" })
  .inputValidator((input: SignInInput) => {
    const identifier = clean(input.identifier);
    const password = clean(input.password);
    if (!identifier || !password) throw new Error("Please enter your details and password.");
    return { identifier, password };
  })
  .handler(async ({ data }): Promise<AuthResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const identifier = data.identifier;
    let email = identifier.toLowerCase();

    if (!identifier.includes("@")) {
      const isPhoneLike = /^[+0-9()\s-]+$/.test(identifier);
      const column = isPhoneLike ? "phone" : "username";
      const value = isPhoneLike ? normalizePhone(identifier) : identifier.toLowerCase();

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq(column, value)
        .maybeSingle();

      if (!profile) {
        return { ok: false, error: "We could not find an account with those details." };
      }
      email = profile.email;
    }

    return signInWithEmail(email, data.password);
  });

async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input as RequestInfo, { ...init, headers });
      },
    },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return { ok: false, error: "Those details did not match an account. Please check and try again." };
  }

  return {
    ok: true,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  };
}
