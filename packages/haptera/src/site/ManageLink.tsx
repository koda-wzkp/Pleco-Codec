// haptera/site/ManageLink.tsx — processor-blind (spec §8).
//
// Footer "Manage your membership" link. The href comes from the instance
// config (ultimately BillingProvider.manageUrl) — this component never knows
// what's behind it.

export interface ManageLinkProps {
  href: string;
  label?: string;
}

export function ManageLink({ href, label = "Manage your membership" }: ManageLinkProps) {
  return (
    <a className="haptera-manage-link" href={href}>
      {label}
    </a>
  );
}
