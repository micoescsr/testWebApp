// components/accounts/UserForm.jsx
import { useState, useEffect } from "react";

const UserForm = ({
  mode = "add",
  user = null,
  onSubmit,
  onCancel,
  onDelete,
}) => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    role: "",
  });

  useEffect(() => {
    if (mode === "edit" && user) {
      // assuming `user` has `firstName` and `lastName` fields;
      // if it only has `name`, split it as needed
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
        role: user.role || "",
      });
    }
  }, [mode, user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    // you can also add a combined name here if your backend expects it
    onSubmit({
      ...formData,
      name: `${formData.firstName} ${formData.lastName}`.trim(),
    });
  };

  return (
    <div className="user-form">
      <div className="form-group">
        <label>First Name</label>
        <input
          name="firstName"
          value={formData.firstName}
          onChange={handleChange}
        />
      </div>

      <div className="form-group">
        <label>Last Name</label>
        <input
          name="lastName"
          value={formData.lastName}
          onChange={handleChange}
        />
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
        <input
          name="role"
          value={formData.role}
          onChange={handleChange}
        />
      </div>

<div className="user-form-footer">
  {mode === "edit" && onDelete && (
    <button className="tertiary-btn" onClick={onDelete}>
      Delete Account
    </button>
  )}

  <div style={{ display: "flex", gap: "10px" }}>
    <button className="cancel-btn" onClick={onCancel}>
      Cancel
    </button>
    <button className="confirm-btn" onClick={handleSubmit}>
      {mode === "add" ? "Add User" : "Save Changes"}
    </button>
  </div>
</div>
    </div>
  );
};

export default UserForm;
