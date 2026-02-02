/* 
async getAnnouncement(req, res) {
  const { network_id } = req.params;
  const { data, error } = await supabase
    .from('captive_portal_announcements')
    .select('*')
    .eq('network_id', network_id)
    .order('created_at', { ascending: false })
    .limit(1);
  res.json(data || []);
}

const { id } = req.params;


async function addAnnouncement(req, res) {
  try {
    const { network_id, content } = req.body;
    const { data, error } = await supabase
      .from('captive_portal_announcements')
      .insert({ network_id, content })  // created_at auto-generates in DB
      .select('id, content, created_at')
      .single();
    if (error) throw error;
    res.json({ success: true, data });  // "Published on" = data.created_at
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function toggleAP(req, res) {
  try {
    const { network_id } = req.params;
    const { data: current } = await supabase.from('networks').select('ap_enabled').eq('network_id', network_id).single();
    const newStatus = !current.ap_enabled;
    const { data, error } = await supabase
      .from('networks')
      .update({ ap_enabled: newStatus })
      .eq('network_id', network_id)
      .select();
    if (error) throw error;
    res.json({ success: true, ap_enabled: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function updateAnnouncement(req, res) {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const { data, error } = await supabase
      .from('captive_portal_announcements')
      .update({ content })
      .eq('id', id)
      .select();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
} */