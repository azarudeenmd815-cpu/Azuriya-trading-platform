"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@azuriya/api-types";
import { message, post } from "@/lib/api";
import { Brand, Icon } from "./icons";
export function Auth({
  serverError,
  initialRegister = false,
}: {
  serverError?: string;
  initialRegister?: boolean;
}) {
  const [register, setRegister] = useState(initialRegister);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: { email: string; password: string; name?: string }) =>
      post<User>(register ? "/auth/register" : "/auth/login", body),
    onSuccess: (user) => {
      client.setQueryData(["me"], user);
      void client.invalidateQueries();
    },
  });
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="story-copy">
          <span className="eyebrow">YOUR MARKET. YOUR PERSPECTIVE.</span>
          <h1>
            Precision at
            <br />
            every position.
          </h1>
          <p>
            A focused workspace for the way you trade.
            <br />
            Native execution. Clear risk. Complete control.
          </p>
          <div className="auth-market-art" aria-hidden="true">
            {[
              30, 49, 37, 57, 71, 62, 85, 74, 98, 117, 101, 134, 118, 155, 142,
              164, 191, 175, 203, 220, 209, 233,
            ].map((height, index) => (
              <i
                key={index}
                className={index % 3 === 1 ? "down" : "up"}
                style={{ height: `${height / 3}px`, bottom: `${height / 2}px` }}
              />
            ))}
          </div>
        </div>
        <div className="story-footer">
          <Icon name="shield" />
          <span>Phase 1 · Native simulated execution</span>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <span className="eyebrow">AZURIYA TERMINAL</span>
          <h2>{register ? "Create your workspace" : "Welcome back"}</h2>
          <p>
            {register
              ? "Start with a simulated account and explore the terminal."
              : "Sign in to access your trading workspace."}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              mutation.mutate({
                email: String(data.get("email")),
                password: String(data.get("password")),
                ...(register ? { name: String(data.get("name")) } : {}),
              });
            }}
          >
            {register && (
              <label>
                Workspace name
                <input
                  name="name"
                  placeholder="Your trading workspace"
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="organization"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                placeholder={
                  register ? "At least 12 characters" : "Enter your password"
                }
                required
                minLength={register ? 12 : 1}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
              />
            </label>
            {(mutation.isError || serverError) && (
              <div role="alert" className="error-box">
                {mutation.isError ? message(mutation.error) : serverError}
              </div>
            )}
            <button
              className="primary-button auth-submit"
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? "Connecting…"
                : register
                  ? "Create simulated account"
                  : "Open trading terminal"}
              <Icon name="arrow" />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to Azuriya?"}{" "}
            <button
              onClick={() => {
                setRegister(!register);
                mutation.reset();
              }}
            >
              {register ? "Sign in" : "Create a workspace"}
            </button>
          </p>
          <div className="simulation-notice">
            <Icon name="info" />
            <span>
              This environment uses simulated funds and execution. No real money
              or external liquidity providers.
            </span>
          </div>
        </div>
        <footer className="auth-footer">
          AZURIYA © {new Date().getFullYear()}
          <span>NATIVE BY DESIGN</span>
        </footer>
      </section>
    </main>
  );
}
