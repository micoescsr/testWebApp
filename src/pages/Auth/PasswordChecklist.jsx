import React from "react";

const rules = [
  {
    label: "At least 8 characters",
    test: (value) => value.length >= 8,
  },
  {
    label: "One uppercase letter (A-Z)",
    test: (value) => /[A-Z]/.test(value),
  },
  {
    label: "One number (0-9)",
    test: (value) => /[0-9]/.test(value),
  },
  {
    label: "One special character (!@#$...)",
    test: (value) => /[!@#$%^&*(){}:\";<>,.?_-]/.test(value),
  },
];

export default function PasswordChecklist({ password }) {
  const hasStartedTyping = password && password.length > 0;
  
  return (
    <div className="password-checklist">
      {rules.map((rule, i) => {
        const isValid = rule.test(password || "");
        const showAsInvalid = hasStartedTyping && !isValid;
        
        return (
          <div
            key={i}
            className={`password-checklist-item ${
              isValid ? "valid" : showAsInvalid ? "invalid" : "neutral"
            }`}
          >
            <span className="checklist-icon">
              {isValid ? "✓" : showAsInvalid ? "✕" : "○"}
            </span>
            <span className="checklist-label">{rule.label}</span>
          </div>
        );
      })}
    </div>
  );
}