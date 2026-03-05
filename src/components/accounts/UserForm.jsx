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
  onReactivate,
  detailsSaved = false,
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

  // Deactivation / reactivation is handled by parent via callbacks
  const isInactive = (user?.status || "").toLowerCase() === "inactive";

  // Gather form data for reactivation (passes edited fields to parent)
  const handleReactivateClick = () => {
    if (onReactivate) {
      onReactivate({
        ...formData,
        id: user?.id,
        name: `${formData.firstName} ${formData.lastName}`.trim(),
      });
    }
  };

  return (
    <div className="user-form">
      {/* --- INACTIVE BANNER --- */}
      {isInactive && (
        <div style={{
          background: detailsSaved ? '#ecfdf5' : '#fef3c7',
          border: `1px solid ${detailsSaved ? '#6ee7b7' : '#f59e0b'}`,
          borderRadius: '8px',
          padding: '12px', marginBottom: '15px', fontSize: '0.85rem',
          color: detailsSaved ? '#065f46' : '#92400e'
        }}>
          {detailsSaved ? (
            <>
              <strong>✔ Profile details saved successfully.</strong>
              <p style={{ margin: '4px 0 0' }}>
                You can now click <em>Reactivate Account</em> below to restore login access
                and optionally issue a temporary password.
              </p>
            </>
          ) : (
            <>
              <strong>This account is deactivated.</strong>
              <p style={{ margin: '4px 0 0' }}>
                <strong>Step 1:</strong> Update the user details below (name, email, username, role), then click
                <em> Save Details</em> to save the profile changes.
              </p>
              <p style={{ margin: '4px 0 0' }}>
                <strong>Step 2:</strong> Click <em>Reactivate Account</em> to restore login access and optionally
                issue a temporary password.
              </p>
            </>
          )}
        </div>
      )}
      {/* --- STATUS CONTROL (SUPER ADMIN ONLY) --- */}
      {currentUserRole === 'superadmin' && (
        <div className="form-group status-group" style={{background: '#f9f9f9', padding: '10px', borderRadius: '8px', marginBottom: '15px'}}>
          <label style={{fontWeight: 'bold', color: '#333'}}>Account Status</label>
          <select
            name="status"
            value={isInactive ? "inactive" : formData.status}
            onChange={handleChange}
            disabled={isInactive}
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '5px',
              borderColor: isInactive ? '#d1d5db' : (formData.status === 'active' ? 'green' : 'orange'),
              backgroundColor: isInactive ? '#f3f4f6' : '#fff',
              color: isInactive ? '#9ca3af' : '#333',
              cursor: isInactive ? 'not-allowed' : 'pointer',
            }}
          >
            {isInactive && <option value="inactive">Deactivated — Account is inactive</option>}
            <option value="active">Active — Can log in normally</option>
            <option value="on_hold">On Hold — Login suspended, data preserved</option>
          </select>
          <small style={{color: '#666'}}>
            {!isInactive && formData.status === 'active' && 'This user can log in and access the system.'}
            {!isInactive && formData.status === 'on_hold' && 'Login is suspended. The user cannot access the system until reactivated.'}
            {isInactive && 'This account is deactivated. Save your detail edits first, then use Reactivate Account to restore access.'}
          </small>
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
        {/* For inactive users, show Reactivate button */}
        {currentUserRole === 'superadmin' && user && isInactive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginRight: 'auto' }}>
            <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 500 }}>
              Account deactivated
            </span>
            <button
              type="button"
              className="reactivate-btn"
              style={{
                fontSize: '0.8rem',
                textAlign: 'left',
                padding: '6px 12px',
                background: '#059669',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              onClick={handleReactivateClick}
            >
              Reactivate Account
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px" }}>
          <button className="cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="confirm-btn"
            onClick={handleSubmit}
          >
            {isInactive ? "Save Details" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserForm;
