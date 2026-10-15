import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import { showroomName } from "@/lib/showroom";

export function AccountsFranchiseeOwners() {
  useDb();
  const { user } = useAuth();
  if (user?.role !== "ACCOUNTS") return null;
  const owners = repo.vendors("FRANCHISEE");
  const projects = repo.projects(user);
  return <section className="rounded-3xl border bg-card p-5 sm:p-6">
    <h2 className="text-xl font-extrabold">Franchisee showrooms <span className="text-sm text-muted-foreground">({owners.length})</span></h2>
    <p className="mt-1 text-sm text-muted-foreground">Showroom names and owner details maintained by Admin.</p>
    {owners.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{owners.map((owner) => <article key={owner.id} className="rounded-2xl border bg-background p-4">
      <h3 className="break-words font-extrabold">{projects.filter((project) => project.franchiseeId === owner.id).map(showroomName).join(" · ") || (owner.city ? `${owner.city} showroom` : "Showroom not assigned")}</h3>
      <p className="mt-2 text-sm"><span className="text-muted-foreground">Owner: </span>{owner.contactName || owner.name}</p>
      <p className="mt-1 text-sm text-muted-foreground">{[owner.city, owner.state].filter(Boolean).join(", ")}</p>
      <p className="mt-1 text-sm">Mobile: {owner.contactPhone || "Not provided"}</p>
      <p className="mt-1 break-all text-sm">Email: {owner.email || "Not provided"}</p>
    </article>)}</div> : <p className="mt-4 rounded-2xl bg-muted/55 p-4 text-sm text-muted-foreground">No franchisee owners added yet.</p>}
  </section>;
}
