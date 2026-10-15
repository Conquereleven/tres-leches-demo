/** Synthetic values in the documented Meta envelopes; never Production data. */
export const metaNumber = {
  id: "wa1" as const,
  label: "Synthetic WA1",
  phone: "+971500000009",
  phoneNumberId: "222",
  wabaId: "333",
};
export const contactPhone = "971500000001";
export const seconds = (offset = 0) =>
  String(Math.floor(Date.now() / 1000) + offset);
export const webhook = (field: string, value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "333",
      changes: [
        { field, value: { metadata: { phone_number_id: "222" }, ...value } },
      ],
    },
  ],
});
export const textMessage = (id: string, offset = 0) => ({
  id,
  from: contactPhone,
  timestamp: seconds(offset),
  type: "text",
  text: { body: `Synthetic ${id}` },
});
export const customerPayload = (id = "wamid.in") =>
  webhook("messages", {
    contacts: [
      { wa_id: contactPhone, profile: { name: "Synthetic Customer" } },
    ],
    messages: [textMessage(id)],
  });
export const echoPayload = (id = "wamid.app") =>
  webhook("smb_message_echoes", {
    message_echoes: [
      { ...textMessage(id), from: "971500000009", to: contactPhone },
    ],
  });
export const historyPayload = () =>
  webhook("history", {
    history: [
      {
        metadata: { phase: 0, chunk_order: 1, progress: 100 },
        threads: [
          {
            id: contactPhone,
            messages: [
              { ...textMessage("wamid.old", -86400 * 3) },
              {
                ...textMessage("wamid.old-out", -86400 * 2),
                from: "971500000009",
                to: contactPhone,
                history_context: { status: "PENDING" },
              },
            ],
          },
        ],
      },
    ],
  });
export const contactPayload = (action = "add", offset = 0) =>
  webhook("smb_app_state_sync", {
    state_sync: [
      {
        type: "contact",
        contact: { phone_number: contactPhone, full_name: "Synthetic Contact" },
        action,
        metadata: { timestamp: seconds(offset) },
      },
    ],
  });
