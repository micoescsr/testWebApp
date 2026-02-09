// hooks/useUsers.js
import { useEffect, useState } from "react";
import {
  getUserAccounts,
  //createUser,
  updateUser,
  // deleteUser,
} from "../api/userApi";

const useUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  

  // =========================
  // READ – Fetch all users
  // =========================
  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getUserAccounts();

      const usersArray = data.data || data.users || data;

      if (!Array.isArray(usersArray)) {
        throw new Error("Users data is not an array");
      }

      const formattedUsers = usersArray.map((u) => ({
        id: u.id,
        name: `${u.first_name} ${u.last_name}`,
        username: u.username,
        email: u.email,
        role: u.role,
        status: u.status || "active",  // ← add this
      }));

      setUsers(formattedUsers);
    } catch (err) {
      console.error("Fetch users error:", err);
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  // =========================
  // CREATE – Add new user
  // =========================
  
  const addUser = async (userPayload) => {
    try {
      setLoading(true);
      setError(null);

      await createUser(userPayload);

      // Refresh list after creation
      await fetchUsers();
    } catch (err) {
      console.error("Add user error:", err);
      setError("Failed to add user");
    } finally {
      setLoading(false);
    }
  };
  

  // =========================
  // UPDATE – Edit existing user
  // =========================
  /*
  const updateUserById = async (userId, userPayload) => {
    try {
      setLoading(true);
      setError(null);

      await updateUser(userId, userPayload);

      // Refresh list after update
      await fetchUsers();
    } catch (err) {
      console.error("Update user error:", err);
      setError("Failed to update user");
    } finally {
      setLoading(false);
    }
  };
  */

  // =========================
  // DELETE – Remove user
  // =========================
  /*
  const deleteUserById = async (userId) => {
    try {
      setLoading(true);
      setError(null);

      await deleteUser(userId);

      // Refresh list after delete
      await fetchUsers();
    } catch (err) {
      console.error("Delete user error:", err);
      setError("Failed to delete user");
    } finally {
      setLoading(false);
    }
  };
  */

  return {
    users,
    loading,
    error,

    // exposed actions
    fetchUsers,

    addUser,
    // updateUserById,
    // deleteUserById,
  };
};

export default useUsers;
