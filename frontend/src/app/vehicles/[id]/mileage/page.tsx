"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Legacy URL: opens add-mileage modal on vehicle detail. */
export default function MileageRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (id) router.replace(`/vehicles/${id}?mileage=1`);
  }, [id, router]);

  return null;
}
