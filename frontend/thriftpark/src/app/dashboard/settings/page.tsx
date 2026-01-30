"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Users, Phone, Lock, TriangleAlert, MessageSquareXIcon, Save } from "lucide-react";

export default function Settings() {
  const [showAccount, setShowAccount] = useState(false);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [password, setPassword] = useState("");

  const router = useRouter();

    useEffect(() => 
    {
      const tp_user = localStorage.getItem("thriftpark_user");

      if (!tp_user) 
      {
        alert("user hasn't logged in");
        router.push("../../"); // go back to login
        return;
      }

      const temp = JSON.parse(tp_user);

      setUsername(temp.username || "");
      setEmail(temp.email || "");
      setPhone(temp.phone_number || "");
      setVehicleType(temp.vehicle_type || "");

      const fetchUserData = async () => {
        try 
        {
          const res = await fetch(`http://localhost:3001/get-user/${temp.username}`);
          if (res.ok) {
            const data = await res.json();
            const user = data.results[0];

            setEmail(user.email || "");
            setPhone(user.phone_number || "");
            setVehicleType(user.vehicle_type || "");
          } 
          else 
          {
            console.error("Failed to fetch user data");
          }
        } 
        catch (err) 
        {
          console.error("Error fetching user data:", err);
        }
      };

      if (showAccount) {
        fetchUserData();
      }
    }, [showAccount, username]);

  const handleLogout = () => {
    localStorage.removeItem("thriftpark_user");
    alert("Logged out");
    router.push("../../"); // go back to login
  };

  const handleDeleteAccount = async () =>
  {
    if (!username) {
      alert("Username not found.");
      return;
    }

    if (confirm("Are you sure you want to delete your account?")) 
    {
      try {
        const res = await fetch(`http://localhost:3001/delete-user/${username}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        });

        if (res.ok) {
          const result = await res.json();
          alert("Account deleted!");
          localStorage.removeItem("thriftpark_user");
          router.push("../../"); // go back to login
        } else {
          const error = await res.json();
          alert("Failed to delete account: " + error.error);
        }
      } catch (err) {
        console.error("Error deleting account:", err);
        alert("An error occurred while deleting your account.");
      }
    }
  };

  const handleSaveChanges = async () => {
    if (!username || !email || !phone || !vehicleType) {
      alert("Please fill out all fields before saving.");
      return;
    }

    try 
    {
      const response = await fetch(`http://localhost:3001/edit-user/${username}`, 
        {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: username,
          password: password,
          vehicle_type: vehicleType,
          email: email,
          phone_number: phone,
        }),
      });

      if (response.ok) 
        {
        const result = await response.json();
        alert("Changes saved!");
        console.log(result);
      } 
      else 
      {
        const error = await response.json();
        alert("Failed to save changes: " + error.error);
      }
    } 
    catch (err) 
    {
      console.error("Error saving changes:", err);
      alert("An error occurred while saving changes.");
    }
    setPassword("");
  };

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-6">
      {!showAccount ? (
        <Card className="w-full max-w-lg bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl">
          <CardHeader>
            <CardTitle className="text-white">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Account Section */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-300 uppercase tracking-wide">
                Account
              </p>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 text-white border-white/30 bg-transparent"
                onClick={() => setShowAccount(true)}
              >
                <Users className="w-5 h-5" />
                Manage your account
              </Button>
            </div>

            {/* Actions */}
            <div className="space-y-5">
              <Button
                variant="destructive"
                className="w-full"
                onClick={handleLogout}
              >
                Log out
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-[-100] w-full max-w-lg bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl space-y-4">
          <CardHeader className="flex justify-between items-center">
            <CardTitle className="text-white">Manage Account</CardTitle>
            <Button variant="ghost" size="sm" className="text-white" onClick={() => setShowAccount(false)}>
              Back
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Username */}
            {/* <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">
                <Users className="w-5 h-5" />
              </span>
              <Input
                className="pl-10 bg-white/10 text-white placeholder-gray-400 border-white/20"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div> */}

            {/* Email */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">
                <Users className="w-5 h-5" />
              </span>
              <Input
                className="pl-10 bg-white/10 text-white placeholder-gray-400 border-white/20"
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Phone */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">
                <Phone className="w-5 h-5" />
              </span>
              <Input
                className="pl-10 bg-white/10 text-white placeholder-gray-400 border-white/20"
                placeholder="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {/* Vehicle Type */}
            <Select value={vehicleType} onValueChange={setVehicleType}>
              <SelectTrigger className="w-full bg-white/10 text-white border-white/20">
                <SelectValue placeholder="Select Vehicle Type" />
              </SelectTrigger>
              <SelectContent className="bg-white text-black border-white/20">
                  <SelectItem value="Car">Car</SelectItem>
                  <SelectItem value="Commercial Vehicle">Commercial Vehicle</SelectItem>
                  <SelectItem value="Motorcycle and Scooter">Motorcycle and Scooter</SelectItem>
                  <SelectItem value="Power-Assisted Bicycle">Power-Assisted Bicycle</SelectItem>
                  <SelectItem value="E-Scooter">E-Scooter</SelectItem>
              </SelectContent>
            </Select>

            {/* Password */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">
                <Lock className="w-5 h-5" />
              </span>
              <Input
                className="pl-10 bg-white/10 text-white placeholder-gray-400 border-white/20"
                placeholder="New Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button onClick={handleSaveChanges} className="w-full bg-transparent border-white/30 text-white hover:bg-white hover:text-black transition">
               <Save className="w-5 h-5" />
              Save Changes
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              className="w-full"
            >
              Delete Account
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
