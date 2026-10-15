import { Link } from "react-router-dom";
import { CheckCircle2, ChevronRight, CreditCard, Receipt } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AccountsInboxEntry } from "@/lib/accountsInbox";

const GROUPS = [
  { id: "PAYMENT", title: "Payment requests", icon: CreditCard, empty: "No payment requests waiting", hint: "Payment verifications, advances and collection requests appear here." },
  { id: "INVOICE", title: "Invoice requests", icon: Receipt, empty: "No invoice requests waiting", hint: "Invoice and shipment billing requests appear here." },
] as const;

function finished(entry: AccountsInboxEntry) {
  return entry.requestStatus === "COMPLETED" || entry.requestStatus === "RETURNED" || entry.requestStatus === "ARCHIVED";
}

function uniqueRequests(entries: AccountsInboxEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.link || !/[?&](verify|shipment)=/.test(entry.link)) return true;
    if (seen.has(entry.link)) return false;
    seen.add(entry.link);
    return true;
  });
}

export function AccountsInbox({ notifications }: { notifications: AccountsInboxEntry[] }) {
  const other = notifications.filter((entry) => !entry.requestCategory);
  return <Tabs defaultValue="PAYMENT">
    <TabsList aria-label="Accounts request types" className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-muted/70 p-1.5">
      {GROUPS.map(({ id, title, icon: Icon }) => {
        const count = uniqueRequests(notifications.filter((entry) => entry.requestCategory === id && !finished(entry))).length;
        return <TabsTrigger key={id} value={id} className="min-h-12 gap-2 whitespace-normal rounded-xl px-2 py-3 text-sm font-extrabold"><Icon className="h-4 w-4 shrink-0"/><span>{title}</span><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs tabular-nums text-primary" aria-label={`${count} waiting`}>{count}</span></TabsTrigger>;
      })}
    </TabsList>
    {GROUPS.map(({ id, empty, hint }) => {
      const entries = notifications.filter((entry) => entry.requestCategory === id);
      const pending = uniqueRequests(entries.filter((entry) => !finished(entry)));
      const history = uniqueRequests(entries.filter(finished));
      return <TabsContent key={id} value={id} className="mt-4 space-y-4">
        {pending.length ? <div className="space-y-3">{pending.map((entry) => <RequestCard key={entry.id} entry={entry}/>)}</div> : <div className="rounded-2xl border border-dashed bg-muted/25 p-6 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-primary"/><p className="mt-3 font-extrabold">{empty}</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{hint}</p></div>}
        {history.length > 0 && <details className="rounded-2xl border bg-muted/20"><summary className="cursor-pointer p-4 text-sm font-bold">Completed requests &amp; history <span className="ml-1 text-muted-foreground">({history.length})</span></summary><div className="space-y-3 border-t p-4">{history.map((entry) => <RequestCard key={entry.id} entry={entry}/>)}</div></details>}
      </TabsContent>;
    })}
    {other.length > 0 && <details className="mt-4 rounded-2xl border"><summary className="cursor-pointer p-4 text-sm font-bold text-muted-foreground">Other account updates ({other.length})</summary><div className="space-y-3 border-t p-4">{other.map((entry) => <RequestCard key={entry.id} entry={entry}/>)}</div></details>}
  </Tabs>;
}

function RequestCard({ entry }: { entry: AccountsInboxEntry }) {
  const complete = finished(entry);
  const status = entry.requestStatus === "COMPLETED" ? "Completed" : entry.requestStatus === "RETURNED" ? "Returned to Ola" : entry.requestStatus === "ARCHIVED" ? "Archived" : entry.requestStatus === "ON_HOLD" ? "On hold" : "Waiting";
  return <Link to={entry.link ?? "/accounts"} className="group flex items-start gap-3 rounded-2xl border bg-background p-4 transition hover:border-primary/40 hover:shadow-sm sm:p-5">
    <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ${complete ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>{complete ? <CheckCircle2 className="h-5 w-5"/> : entry.requestCategory === "PAYMENT" ? <CreditCard className="h-5 w-5"/> : <Receipt className="h-5 w-5"/>}</span>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{entry.title}</p>{entry.requestCategory && <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${complete ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>{status}</span>}</div><p className="mt-1.5 break-words text-sm leading-relaxed text-muted-foreground">{entry.detail}</p><span className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-extrabold text-primary">{complete ? "View status" : "Open request"}<ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"/></span></div>
  </Link>;
}
