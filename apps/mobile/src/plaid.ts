import { Platform } from "react-native";
import { create, open, type LinkExit, type LinkSuccess } from "react-native-plaid-link-sdk";
import { api } from "./api";

export async function connectBank(itemId?: string): Promise<void> {
  const { linkToken } = await api<{ linkToken: string }>("/api/plaid/link-token", {
    method: "POST",
    body: JSON.stringify({
      itemId,
      platform: Platform.OS === "android" ? "android" : "ios",
    }),
  });
  create({ token: linkToken });
  await new Promise<void>((resolve, reject) => {
    open({
      onSuccess: (success: LinkSuccess) => {
        const institution = success.metadata.institution;
        const run = itemId
          ? api("/api/plaid/sync", { method: "POST", body: "{}" })
          : api("/api/plaid/exchange", {
              method: "POST",
              body: JSON.stringify({
                public_token: success.publicToken,
                metadata: {
                  institution: institution
                    ? { institution_id: institution.id, name: institution.name }
                    : undefined,
                },
              }),
            });
        void run.then(() => resolve()).catch(reject);
      },
      onExit: (exit: LinkExit) => {
        if (exit.error) {
          reject(new Error(exit.error.displayMessage || exit.error.errorMessage || "Plaid closed"));
          return;
        }
        reject(new Error("Bank connect was cancelled."));
      },
    });
  });
}
