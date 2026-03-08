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

  // UI: Detect anonymized placeholder values set during deactivation
  const isAnonymizedValue = (value = "") => {
    const v = value.toLowerCase().trim();
    return (
      v.startsWith("deactivated_") ||
      v === "deactivated user" ||
      v.endsWith("@deactivated.local")
    );
  };

  useEffect(() => {
    if (user) {
      const isInactiveUser = (user.status || "").toLowerCase() === "inactive";

      const rawFirst = user.firstName || user.name?.split(" ")[0] || "";
      const rawLast =
        user.lastName ||
        (user.name?.includes(" ")
          ? user.name.split(" ").slice(1).join(" ")
          : "");

      // Clear anonymized placeholder values so the admin must enter real details
      const firstName = isInactiveUser && isAnonymizedValue(rawFirst) ? "" : rawFirst;
      const lastName  = isInactiveUser && isAnonymizedValue(rawLast)  ? "" : rawLast;
      const username  = isInactiveUser && isAnonymizedValue(user.username) ? "" : (user.username || "");
      const email     = isInactiveUser && isAnonymizedValue(user.email)    ? "" : (user.email || "");

      setFormData({
        firstName,
        lastName,
        username,
        email,
        role: user.role === "staff" ? "user" : (user.role || "user"), // Migrate legacy "staff" → "user"
        status: user.status || "active",
      });
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Deactivation / reactivation is handled by parent via callbacks
  const isInactive = (user?.status || "").toLowerCase() === "inactive";

  const handleSubmit = () => {
    // For inactive users, validate required fields before saving —
    // blank fields would get written to the DB and leave Reactivate permanently grayed out.
    if (isInactive) {
      const requiredFields = [
        { key: "firstName", label: "First Name" },
        { key: "lastName",  label: "Last Name" },
        { key: "username",  label: "Username" },
        { key: "email",     label: "Email" },
      ];
      const missing = requiredFields.filter(
        (f) => !formData[f.key]?.trim() || isAnonymizedValue(formData[f.key])
      );
      if (missing.length > 0) {
        alert(
          `Please fill in the following fields before saving:\n• ${missing
            .map((f) => f.label)
            .join("\n• ")}`
        );
        return;
      }
    }

    onSubmit({
      ...formData,
      name: `${formData.firstName} ${formData.lastName}`.trim(),
    });
  };

  // Gather form data for reactivation (passes edited fields to parent)
  const handleReactivateClick = () => {
    // Guard: all required fields must be filled with real (non-anonymized) values
    const requiredFields = [
      { key: "firstName", label: "First Name" },
      { key: "lastName",  label: "Last Name" },
      { key: "username",  label: "Username" },
      { key: "email",     label: "Email" },
    ];

    const missing = requiredFields.filter(
      (f) => !formData[f.key]?.trim() || isAnonymizedValue(formData[f.key])
    );

    if (missing.length > 0) {
      alert(
        `Please provide valid values for the following fields before reactivating:\n• ${missing
          .map((f) => f.label)
          .join("\n• ")}`
      );
      return;
    }

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
                The original profile data was anonymized for security. Fields have been cleared —
                please enter the real name, email, username, and role for this user.
              </p>
              <p style={{ margin: '4px 0 0' }}>
                <strong>Step 1:</strong> Fill in the fields below with valid details, then click
                <em> Save Details</em> to save the profile changes.
              </p>
              <p style={{ margin: '4px 0 0' }}>
                <strong>Step 2:</strong> Click <em>Reactivate Account</em> to restore login access and issue a temporary password.
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
          <label>
            First Name
            {isInactive && <span style={{ color: '#dc2626', marginLeft: '3px' }}>*</span>}
          </label>
          <input
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            style={isInactive && (!formData.firstName?.trim() || isAnonymizedValue(formData.firstName)) ? { borderColor: '#dc2626' } : {}}
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>
            Last Name
            {isInactive && <span style={{ color: '#dc2626', marginLeft: '3px' }}>*</span>}
          </label>
          <input
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
            style={isInactive && (!formData.lastName?.trim() || isAnonymizedValue(formData.lastName)) ? { borderColor: '#dc2626' } : {}}
          />
        </div>
      </div>

      <div className="form-group">
        <label>
          Username
          {isInactive && <span style={{ color: '#dc2626', marginLeft: '3px' }}>*</span>}
        </label>
        <input
          name="username"
          value={formData.username}
          onChange={handleChange}
          style={isInactive && (!formData.username?.trim() || isAnonymizedValue(formData.username)) ? { borderColor: '#dc2626' } : {}}
        />
      </div>

      <div className="form-group">
        <label>
          Email
          {isInactive && <span style={{ color: '#dc2626', marginLeft: '3px' }}>*</span>}
        </label>
        <input
          name="email"
          value={formData.email}
          onChange={handleChange}
          style={isInactive && (!formData.email?.trim() || isAnonymizedValue(formData.email)) ? { borderColor: '#dc2626' } : {}}
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
        {currentUserRole === 'superadmin' && user && isInactive && (() => {
          const requiredFields = ["firstName", "lastName", "username", "email"];
          const canReactivate = requiredFields.every(
            (k) => formData[k]?.trim() && !isAnonymizedValue(formData[k])
          );
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginRight: 'auto' }}>
              <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 500 }}>
                Account deactivated
              </span>
              <button
                type="button"
                className="reactivate-btn"
                disabled={!canReactivate}
                title={!canReactivate ? "Fill in all required fields with valid values first" : ""}
                style={{
                  fontSize: '0.8rem',
                  textAlign: 'left',
                  padding: '6px 12px',
                  background: canReactivate ? '#059669' : '#d1d5db',
                  color: canReactivate ? '#fff' : '#9ca3af',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: canReactivate ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                }}
                onClick={handleReactivateClick}
              >
                Reactivate Account
              </button>
            </div>
          );
        })()}

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
