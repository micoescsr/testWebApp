// components/accounts/UserForm.jsx
import { useState, useEffect } from "react";

// UI-003: Derive reset slot state from profile data
const getResetSlotState = (user) => {
  if (!user) return { state: "none", label: "No Reset", color: "#666" };

  const mustChange = user.must_change_password;
  const expiresAt = user.temp_expires_at ? new Date(user.temp_expires_at) : null;
  const now = new Date();

  if (!mustChange && !expiresAt) {
    return { state: "none", label: "No pending reset", color: "#666" };
  }
  if (mustChange && expiresAt && expiresAt > now) {
    const diff = expiresAt - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    return { state: "temp_issued", label: `Temp PW issued (expires in ${timeStr})`, color: "#f59e0b" };
  }
  if (mustChange && expiresAt && expiresAt <= now) {
    return { state: "expired", label: "Temp PW expired", color: "#dc2626" };
  }
  if (mustChange && !expiresAt) {
    return { state: "temp_used", label: "Password change required", color: "#2563eb" };
  }
  return { state: "none", label: "No pending reset", color: "#666" };
};

const UserForm = ({
  user = null,
  onSubmit,
  onCancel,
  onDeactivate,
  currentUserRole = "superadmin", // Pass this prop from parent to check permissions
}) => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    role: "",
    status: "active", // Default status
  });

  useEffect(() => {
    if (user) {
      const firstName = user.firstName || user.name?.split(" ")[0] || "";
      const lastName =
        user.lastName ||
        (user.name?.includes(" ")
          ? user.name.split(" ").slice(1).join(" ")
          : "");

      setFormData({
        firstName,
        lastName,
        username: user.username || "",
        email: user.email || "",
        role: user.role === "staff" ? "user" : (user.role || "user"), // Migrate legacy "staff" → "user"
        status: user.status || "active",
      });
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    onSubmit({
      ...formData,
      name: `${formData.firstName} ${formData.lastName}`.trim(),
    });
  };

  // Deactivation is handled by parent via onDeactivate callback
  const isInactive = (user?.status || "").toLowerCase() === "inactive";

  return (
    <div className="user-form">
      {/* --- INACTIVE BANNER --- */}
      {isInactive && (
        <div style={{
          background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px',
          padding: '12px', marginBottom: '15px', fontSize: '0.85rem', color: '#92400e'
        }}>
          <strong>This account is deactivated.</strong>
          <p style={{ margin: '4px 0 0' }}>
            To reactivate, set the status to Active or On Hold and save. If the user needs a new password, 
            you'll be prompted to issue a temporary one.
          </p>
        </div>
      )}
      {/* --- STATUS CONTROL (SUPER ADMIN ONLY) --- */}
      {currentUserRole === 'superadmin' && (
        <div className="form-group status-group" style={{background: '#f9f9f9', padding: '10px', borderRadius: '8px', marginBottom: '15px'}}>
          <label style={{fontWeight: 'bold', color: '#333'}}>Account Status</label>
          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            style={{width: '100%', padding: '8px', marginTop: '5px', borderColor: formData.status === 'active' ? 'green' : 'orange'}}
          >
            <option value="active">Active — Can log in normally</option>
            <option value="on_hold">On Hold — Login suspended, data preserved</option>
          </select>
          <small style={{color: '#666'}}>
            {formData.status === 'active' && 'This user can log in and access the system.'}
            {formData.status === 'on_hold' && 'Login is suspended. The user cannot access the system until reactivated.'}
            {formData.status === 'inactive' && 'This account is inactive. Change status to Active or On Hold to manage it.'}
          </small>
          {formData.status === 'inactive' && (
            <p style={{fontSize: '0.8rem', color: '#b45309', marginTop: '4px'}}>
              This account is currently inactive. Select a new status above to update it.
            </p>
          )}
        </div>
      )}

      <div className="form-row" style={{ display: 'flex', gap: '15px' }}>
        <div className="form-group" style={{ flex: 1 }}>
          <label>First Name</label>
          <input
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Last Name</label>
          <input
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Username</label>
        <input
          name="username"
          value={formData.username}
          onChange={handleChange}
        />
      </div>

      <div className="form-group">
        <label>Email</label>
        <input
          name="email"
          value={formData.email}
          onChange={handleChange}
        />
      </div>

      <div className="form-group">
        <label>Role</label>
        <select name="role" value={formData.role} onChange={handleChange}>
           <option value="superadmin">Super Admin</option>
           <option value="admin">Admin</option>
           <option value="user">User</option>
        </select>
      </div>

      <div className="user-form-footer" style={{marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px'}}>
        {/* Deactivate account action — only for existing active/on_hold users */}
        {currentUserRole === 'superadmin' && user && !isInactive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginRight: 'auto' }}>
            <span style={{ fontSize: '0.75rem', color: getResetSlotState(user).color, fontWeight: 500 }}>
              {getResetSlotState(user).label}
            </span>
            <button
              type="button"
              className="tertiary-btn"
              style={{ fontSize: '0.8rem', textAlign: 'left', padding: 0 }}
              onClick={() => onDeactivate && onDeactivate(user)}
            >
              Deactivate Account
            </button>
          </div>
        )}
        {/* For inactive users, show archived state */}
        {currentUserRole === 'superadmin' && user && isInactive && (
          <div style={{ marginRight: 'auto' }}>
            <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 500 }}>
              Account deactivated
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px" }}>
          <button className="cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="confirm-btn" onClick={handleSubmit}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserForm;
