// 7:0 0:1 0:0
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ProvidersPage() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/console"); }, []);
  return null;
}
// 7:0 0:1 0:0
