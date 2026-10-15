import { useCallback, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/features/auth/AuthContext";
import { SellerProfilePromptContext } from "@/lib/sellerProfilePrompt";

export function SellerProfilePromptProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const prompt = useCallback(() => setOpen(true), []);

  function openProfile() {
    const base = user?.role === "ACCOUNTS" ? "/accounts" : "/admin";
    navigate(`${base}/business-profile`, {
      state: { returnTo: `${location.pathname}${location.search}${location.hash}` },
    });
  }

  return <SellerProfilePromptContext.Provider value={prompt}>
    {children}
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Complete Kurchi’s billing details</AlertDialogTitle>
          <AlertDialogDescription>
            Add Kurchi’s legal business name, GSTIN, PAN, registered address, state and PIN code before creating or printing a tax invoice. Select Okay to open the legal seller profile, then save your details to return to billing.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={openProfile}>Okay</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </SellerProfilePromptContext.Provider>;
}
