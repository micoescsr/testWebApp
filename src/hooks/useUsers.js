// hooks/useUsers.js
import { useEffect, useState } from "react";
import { getUserAccounts } from "../api/userApi";
import { useApiResource } from "./useApiResource";

const useUsers = () => {
  const [users, setUsers] = useState([]);
  const { loading, error, run } = useApiResource("Failed to load users");

  // =========================
  // READ – Fetch all users
  // =========================
  const fetchUsers = () =>
    run(async () => {
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
        status: u.status || "active",
        must_change_password: u.must_change_password || false,
        temp_expires_at: u.temp_expires_at || null,
      }));

      setUsers(formattedUsers);
    });

  // Auto-fetch on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  return {
    users,
    loading,
    error,
    fetchUsers,
  };
};

export default useUsers;
