import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/crm/states";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <EmptyState icon={SearchX} title="Nothing here" description="That page or record doesn't exist, or isn't yours to see." action={<Button asChild><Link href="/">Go home</Link></Button>} />
    </div>
  );
}
