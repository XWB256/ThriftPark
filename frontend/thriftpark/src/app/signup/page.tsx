// correct version

"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import DarkVeil from "@/components/DarkVeil";
import TextType from "@/components/TextType";
import Stepper, { Step } from "@/components/Stepper";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SignUpPage() {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState<string>("");
  const [vehicleType, setVehicleType] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  // Automatically mask email whenever it changes
  const maskedEmail = useMemo(() => {
    if (!email) return "";
    return email.replace(/(.{2})(.*)(?=@)/, (_, a, b) => a + "*".repeat(b.length));
  }, [email]);

  // ---- STEP 1: CREATE USER ----
  const handleCreateUser = async () => {
    if (!username || !name || !email || !password || !phoneNumber) {
      alert("Please fill in all fields.");
      return false;
    }

    setLoading(true);
    try {
      const res = await fetch("http://localhost:3007/check-existence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create user");

      // Step 1 succeeded → send OTP
      alert("Verifying email and sending OTP......");
      await handleSendOtp();
      return true;
    } catch (err: any) {
      console.error("Signup error:", err);
      alert(err.message || "Error creating account.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ---- STEP 1.5: SEND OTP ----
  const handleSendOtp = async () => {
    if (!email) {
      alert("Email is required for OTP.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("http://localhost:3007/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send OTP");

      alert("OTP sent to your email!");
    } catch (err: any) {
      console.error("Send OTP error:", err);
      alert(err.message || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  // ---- STEP 2: VERIFY OTP ----
  const handleVerifyOtp = async () => {
    if (!email || !otp) {
      alert("Please enter OTP.");
      return false;
    }

    setLoading(true);
    try {
      const res = await fetch("http://localhost:3007/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "OTP verification failed");

      //alert("OTP verified!");
      return true;
    } catch (err: any) {
      console.error("Verify OTP error:", err);
      alert(err.message || "OTP verification failed.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ---- STEP 3: UPDATE VEHICLE TYPE ----
  const handleUpdateVehicle = async () => {
    if (!vehicleType) {
      alert("Please select a vehicle type.");
      return false;
    }

    setLoading(true);
    try {
      const res = await fetch("http://localhost:3001/add-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          name,
          password,
          vehicle_type: vehicleType,
          email,
          phone_number: phoneNumber,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add user");

      //alert("Vehicle type saved!");
      return true;
    } catch (err: any) {
      console.error("Create user error:", err);
      alert(err.message || "Failed to create user.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ---- FINAL STEP ----
  const handleAllStepsCompleted = () => {
    alert("Signup complete! Redirecting to login page!");
    router.push("/");
  };

  // ---- RETURN TO HOME ----
  const handleReturnHome = () => {
    router.push("/");
  };

  return (
    <>
      {/* Left side */}
      <div className="w-1/2 relative flex items-center justify-center bg-purple-900 overflow-hidden">
        <DarkVeil
          hueShift={0}
          noiseIntensity={0.03}
          scanlineIntensity={0.05}
          speed={0.5}
          scanlineFrequency={50}
          warpAmount={0.03}
          resolutionScale={1}
        />
        <div className="absolute text-center text-white z-10 px-4">
          <h1 className="text-4xl font-bold">Join ThriftPark</h1>
          <TextType
            text={["Step-by-Step Sign Up", "Secure OTP Verification"]}
            typingSpeed={75}
            pauseDuration={1500}
            showCursor={true}
            cursorCharacter="|"
          />
        </div>
      </div>

      {/* Right side */}
      <div className="w-1/2 flex items-center justify-center bg-transparent text-white">
        <div className="max-w-md w-full p-8 rounded-xl">

          <Stepper
            initialStep={1}
            onNextStep={async (step) => {
              if (step === 1) return await handleCreateUser();
              if (step === 2) return await handleVerifyOtp();
              if (step === 3) return await handleUpdateVehicle();
              return true;
            }}
            onFinalStepCompleted={handleAllStepsCompleted}
            backButtonText="Previous"
            nextButtonText="Next"
            backButtonProps={{ style: { color: "white" } }}
            nextButtonProps={{ style: { color: "white" } }}
          >

            {/* Step 1: Sign Up */}
            <Step>
              <h2 className="text-2xl font-semibold mb-4 text-center">Sign Up</h2>
              <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
                <input
                  type="text"
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
                <input
                  type="tel"
                  placeholder="+65 1234 5678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  pattern="^\+?[0-9]{7,15}$"
                  title="Please enter a valid phone number"
                  required
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </form>

              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleReturnHome}
                  className="font-medium text-white underline"
                >
                  Go back to login
                </button>
              </div>
            </Step>



            {/* Step 2: OTP Verification */}
            <Step>
              <h2 className="text-2xl font-semibold mb-4 text-center">Enter OTP</h2>
              <p className="text-sm mb-6 text-center text-gray-400">
                We have sent a 6-digit OTP to <strong>{maskedEmail}</strong>
              </p>
              <div className="flex justify-center mb-6">
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <button
                onClick={handleSendOtp}
                disabled={loading}
                className="w-full mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md disabled:opacity-50"
              >
                Resend OTP
              </button>
              {loading && (
                <p className="text-center mt-4 text-sm text-gray-400">
                  Sending OTP...
                </p>
              )}

              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleReturnHome}
                  className="font-medium text-white underline"
                >
                  Go back to login
                </button>
              </div>
            </Step>

            {/* Step 3: Vehicle Type */}
            <Step>
              <h2 className="text-2xl font-semibold mb-4 text-center">Select Your Vehicle</h2>
              <Select onValueChange={setVehicleType} value={vehicleType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select your vehicle type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Car">Car</SelectItem>
                  <SelectItem value="Commercial Vehicle">Commercial Vehicle</SelectItem>
                  <SelectItem value="Motorcycle and Scooter">Motorcycle and Scooter</SelectItem>
                  <SelectItem value="Power-Assisted Bicycle">Power-Assisted Bicycle</SelectItem>
                  <SelectItem value="E-Scooter">E-Scooter</SelectItem>
                </SelectContent>
              </Select>

              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleReturnHome}
                  className="font-medium text-white underline"
                >
                  Go back to login
                </button>
              </div>
            </Step>

            {/* Step 4: Welcome */}
            <Step>
              <h2 className="text-2xl font-semibold text-center mb-4">Welcome!</h2>
              <p className="text-center">You have successfully signed up for ThriftPark.</p>
            </Step>
          </Stepper>
        </div>
      </div>
    </>
  );
}
