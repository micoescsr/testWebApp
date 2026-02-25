// api/scansApi.js
import { supabase } from "../lib/supabaseClient";

export const getScansForNetwork = async (networkId) => {
  const { data, error } = await supabase
    .from("scans")
    .select("scan_id, created_at")
    .eq("network_id", networkId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
};
