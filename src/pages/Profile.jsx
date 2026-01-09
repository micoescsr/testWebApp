import "./Profile.css";

const Profile = () => {
  const profileData = {
    welcomeName: "Pedro Gil",
    email: "pgil@gmail.com",
    firstName: "Pedro",
    lastName: "Gil",
    username: "Admin001",
    password: "password123",
  };

  return (
    <div className="profile-page">
      <h1 className="page-title">Welcome, {profileData.welcomeName}!</h1>

      <div className="profile-form">
        {/* Email */}
        <div className="form-group">
          <label>Email</label>
          <input type="text" value={profileData.email} readOnly />
        </div>

        {/* First Name */}
        <div className="form-group">
          <label>First Name</label>
          <input type="text" value={profileData.firstName} readOnly />
        </div>

        {/* Last Name */}
        <div className="form-group">
          <label>Last Name</label>
          <input type="text" value={profileData.lastName} readOnly />
        </div>

        {/* Username */}
        <div className="form-group">
          <label>Username</label>
          <input type="text" value={profileData.username} readOnly />
        </div>

        {/* Password */}
        <div className="form-group">
          <div className="password-label-row">
            <label>Password</label>
            <span className="reset-link">Reset Password</span>
          </div>
          <input type="password" value={profileData.password} readOnly />
        </div>

        {/* Note 
        <p className="password-note">
          Note: Contact your super administrator to change your password
        </p>*/}
      </div>
    </div>
  );
};

export default Profile;
