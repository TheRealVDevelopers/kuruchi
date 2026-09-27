import { PageHeader } from "@/components/app/Shell";
import { RuleTag } from "@/components/app/RuleGate";
import { RULE_INDEX } from "@/lib/rules";

/**
 * The rule catalogue, readable in the app rather than only in the docs.
 * Every id here matches a gate in lib/rules.ts and a row in docs/02-workflow.md.
 */
export default function RuleBookPage() {
  const groups = RULE_INDEX.reduce<Record<string, typeof RULE_INDEX>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        eyebrow="Reference"
        title="Rule book"
        description="What the system refuses to do, and why. Every rule here is enforced in code — see src/lib/rules.ts."
      />

      <div className="space-y-6">
        {Object.entries(groups).map(([group, rules]) => (
          <section key={group}>
            <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {group}
            </h2>
            <ul className="divide-y rounded-lg border bg-card">
              {rules.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <RuleTag id={r.id} />
                  <span className="min-w-0 flex-1 text-sm">{r.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
