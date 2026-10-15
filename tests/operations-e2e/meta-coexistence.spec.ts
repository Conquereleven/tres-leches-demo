import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import type { State } from "../../server/domain/model";
import { normalizeMetaInbound } from "../../server/adapters/meta-inbound";
import { applyWhatsAppMessage } from "../../server/domain/whatsapp-inbound";
import { workspace } from "../fixtures/ux-states";
import {
  metaNumber,
  customerPayload,
  echoPayload,
  historyPayload,
  webhook,
  textMessage,
} from "../fixtures/meta-coexistence";
for (const width of [390, 1440])
  for (const language of ["en", "tl"]) {
    test(`coexistence Inbox ${language} ${width}: origin, media, history and no outbound`, async ({
      page,
    }, info) => {
      const data = workspace();
      const s = {
        conversations: [],
        orders: [],
        payments: [],
        jobs: [],
        zones: [],
        events: {},
        commands: {},
        audit: [],
      } as State;
      for (const payload of [
        historyPayload(),
        customerPayload(),
        echoPayload(),
        webhook("messages", {
          messages: [
            {
              ...textMessage("wamid.audio"),
              type: "audio",
              audio: {
                id: "synthetic-voice",
                mime_type: "audio/ogg",
                voice: true,
              },
            },
          ],
        }),
      ])
        for (const e of normalizeMetaInbound(payload, [metaNumber]))
          if (e.type === "message") applyWhatsAppMessage(s, e, [metaNumber]);
      const c = s.conversations[0]!;
      c.unread = false;
      const snapshot = {
        ...data,
        numbers: [metaNumber],
        conversations: s.conversations,
        orders: [],
        payments: [],
        jobs: [],
        ai: {
          configured: false,
          enabled: false,
          defaultMode: "copilot",
          autonomousAllowed: false,
          sessions: s.ai?.sessions ?? {},
          runs: [],
          enquiries: [],
        },
      };
      const errors: string[] = [],
        writes: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.route("**/api/**", async (r) => {
        if (r.request().method() !== "GET") {
          writes.push(r.request().url());
          return r.fulfill({
            status: 403,
            json: { error: "Outbound disabled" },
          });
        }
        return r.fulfill({ json: snapshot });
      });
      await page.addInitScript(
        ({ id, lang }) =>
          localStorage.setItem(
            `3l-operations-language:${encodeURIComponent(id)}`,
            lang,
          ),
        { id: data.actor.id, lang: language },
      );
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/operations/inbox");
      await page
        .locator(".co-conversation")
        .filter({ hasText: c.customer })
        .click();
      const chat = page.locator(".co-chat");
      await expect(chat.locator(".co-message")).toHaveCount(5);
      await expect(chat).toContainText(
        language === "en"
          ? "Sent from WhatsApp Business App"
          : "Ipinadala mula sa WhatsApp Business App",
      );
      await expect(chat).toContainText(
        language === "en" ? "Imported history" : "Na-import na history",
      );
      await expect(chat).toContainText(
        language === "en"
          ? "Media metadata only; view in WhatsApp"
          : "Metadata lang; tingnan sa WhatsApp",
      );
      await expect(chat).toContainText("WA1");
      await expect(chat.locator(".co-message.out")).toHaveCount(2);
      await expect(chat.locator("textarea")).toBeDisabled();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      mkdirSync("work/qa/meta-coexistence", { recursive: true });
      await page.screenshot({
        path: `work/qa/meta-coexistence/${info.project.name}-${language}-${width}.png`,
        fullPage: true,
      });
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
