// components/accounts/UserForm.jsx
import { useState, useEffect } from "react";

const UserForm = ({
  user = null,
  onSubmit,
  onCancel,
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
        role: user.role || "staff", // Default role
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

  // Function to clear data if we want to "Empty" a slot
  const handleClearSlot = () => {
    setFormData({
      firstName: "Unknown",
      lastName: "User",
      username: `user_slot_${user?.id || 'x'}`, // Keep a placeholder ID
      email: "",
      role: "staff",
      status: "inactive"
    });
  };

  return (
    <div className="user-form">
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
            <option value="active">Active (Can Login)</option>
            <option value="on_hold">On Hold (Access Suspended)</option>
            {/* Optional: 'inactive' if you use that for empty slots */}
            <option value="inactive">Inactive / Empty Slot</option>
          </select>
          <small style={{color: '#666'}}>
            "On Hold" prevents the user from logging in but keeps their data.
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
           <option value="staff">Staff</option>
        </select>
      </div>

      <div className="user-form-footer" style={{marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px'}}>
        {/* Helper to clear slot if needed */}
        {currentUserRole === 'superadmin' && (
             <button className="tertiary-btn" style={{marginRight: 'auto', color: '#888'}} onClick={handleClearSlot}>
               Reset Slot
             </button>
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
