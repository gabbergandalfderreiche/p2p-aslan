"use client";

import { useConnection, useDisconnect } from "wagmi";
import { useConnectModal } from "./ConnectModal";
import { useT } from "@/i18n/client";

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Header button: opens the sign-in dialog, or shows the connected address (click to sign out). */
export function ConnectButton() {
  const { t } = useT();
  const { address, isConnected } = useConnection();
  const disconnect = useDisconnect();
  const { open } = useConnectModal();

  if (isConnected && address) {
    return (
      <button className="btn btn-ghost !py-2 text-sm" onClick={() => disconnect.mutate()} title={t.connect.logout}>
        <span className="h-2 w-2 rounded-full bg-good" />
        <span className="num">{short(address)}</span>
      </button>
    );
  }

  return (
    <button className="btn btn-primary !py-2 text-sm" onClick={open}>
      {t.connect.login}
    </button>
  );
}
