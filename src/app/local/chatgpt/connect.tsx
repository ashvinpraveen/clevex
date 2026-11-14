"use client";
import { useState } from "react";
import { ConnectDialog } from "@/components/connect-dialog";
import { Button } from "@/components/ui/button";

export function LocalChatGPTConnect() {
  const [open, setOpen] = useState(true);
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="font-serif text-3xl">Connect ChatGPT to Clevex</h1>
      <p className="text-muted-foreground">
        Use your ChatGPT plan for AI editing in the Clevex editor on this
        machine.
      </p>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Manage AI connections
      </Button>
      <ConnectDialog open={open} onOpenChange={setOpen} initial="chatgpt" />
    </main>
  );
}
