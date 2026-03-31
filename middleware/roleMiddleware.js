export const allowRoles = (...allowedRoles) => {
  return (req, res, next) => {
    const user = req.user; // Comes from auth middleware

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ message: "Access Denied" });
    }

    next();
  };
};