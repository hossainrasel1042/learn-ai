"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Suspense } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch, ApiError } from "@/lib/api";
import { validateFile } from "@/lib/storage";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { BadgeCard } from "@/components/gamification/badge-card";
import { XpProgress } from "@/components/gamification/xp-progress";
import { useBadges } from "@/hooks/use-gamification";
import { CopyButton } from "@/components/chat/copy-button";
import {
    getFriendCode,
    regenerateFriendCode,
} from "@/lib/api/quiz-battle-api";
import { Loader2, X } from "lucide-react";


const profileFormSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    avatarUrl: z.string().url().optional().or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;


const deleteAccountSchema = z.object({
    password: z.string().min(1, "Password is required"),
});

type DeleteAccountValues = z.infer<typeof deleteAccountSchema>;

const ProfilePage = ({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) => {
    return (
        <Suspense fallback={
            <div className="flex min-h-[calc(100vh-65px)] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        }>
            <ProfilePageInner searchParams={searchParams} />
        </Suspense>
    );
};

const ProfilePageInner = ({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) => {
    const params= use(searchParams);
    const tab = params?.tab || "details";
    const [activeTab, setActiveTab] = useState(tab);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [friendCode, setFriendCode] = useState<string | null>(null);
    const [isRegeneratingCode, setIsRegeneratingCode] = useState(false);

    const { user, isLoading, mutate } = useAuth();
    const router = useRouter();

    const profileForm = useForm<ProfileFormValues>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: {
            name: user?.profile?.name || "",
            avatarUrl: user?.profile?.avatarUrl || "",
        },
    });

    const deleteAccountForm = useForm<DeleteAccountValues>({
        resolver: zodResolver(deleteAccountSchema),
        defaultValues: {
            password: "",
        },
    });



    useEffect(() => {
        if (user?.profile) {
            profileForm.reset({
                name: user.profile.name || "",
                avatarUrl: user.profile.avatarUrl || "",
            });
            setFriendCode(user.profile.friendCode ?? null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const { friendCode: code } = await getFriendCode();
                if (!cancelled) setFriendCode(code);
            } catch {
                // The profile block still works without it — the code can be
                // minted again from the play page.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    const onRegenerateFriendCode = async () => {
        setIsRegeneratingCode(true);
        try {
            const { friendCode: code } = await regenerateFriendCode();
            setFriendCode(code);
            toast.success("Your profile code was changed");
        } catch (error) {
            console.error("Friend code regeneration error:", error);
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "Could not change your profile code",
            );
        } finally {
            setIsRegeneratingCode(false);
        }
    };


    const onProfileSubmit = async (data: ProfileFormValues) => {
        if (!user?.id) return;

        setIsUpdating(true);
        try {
            let avatarUrl: string | null | undefined = data.avatarUrl;

            if (selectedFile) {
                const validation = validateFile(selectedFile);
                if (!validation.valid) {
                    toast.error(validation.error || "Invalid file");
                    setIsUpdating(false);
                    return;
                }

                const formData = new FormData();
                formData.append("file", selectedFile);
                const uploadResult = await apiFetch<{ path: string; url: string }>(
                    "/storage/avatars",
                    { method: "POST", formData },
                );

                avatarUrl = uploadResult.url;
            }



            await apiFetch("/me", {
                method: "PATCH",
                body: {
                    name: data.name,
                    avatarUrl: avatarUrl === "" ? null : avatarUrl,
                },
            });

            toast.success("Profile updated successfully");
            await mutate();
            setSelectedFile(null);
            setAvatarPreview(null);
        } catch (error) {
            console.error("Profile update error:", error);
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "Something went wrong while updating your profile",
            );
        } finally {
            setIsUpdating(false);
        }
    };

    const handleAvatarSelect = (
        file: File | null,
        previewUrl: string | null,
    ) => {
        setSelectedFile(file);
        setAvatarPreview(previewUrl);
    };



    const prevPreviewRef = useRef<string | null>(null);
    useEffect(() => {
        if (
            prevPreviewRef.current &&
            prevPreviewRef.current !== avatarPreview
        ) {
            URL.revokeObjectURL(prevPreviewRef.current);
        }
        prevPreviewRef.current = avatarPreview;
    }, [avatarPreview]);


    useEffect(() => {
        return () => {
            if (prevPreviewRef.current) {
                URL.revokeObjectURL(prevPreviewRef.current);
            }
        };
    }, []);

    const handleDeleteAccount = async (data: DeleteAccountValues) => {
        if (!user?.id) return;

        setIsDeleting(true);
        try {
            await apiFetch("/me", {
                method: "DELETE",
                body: { password: data.password },
            });

            toast.success("Account deleted successfully");
            router.push("/");
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "Failed to delete account",
            );
        } finally {
            setIsDeleting(false);
        }
    };

    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/auth");
        }
    }, [isLoading, user, router]);

    if (isLoading) {
        return (
            <div className="flex min-h-[calc(100vh-65px)] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <div className="container mx-auto max-w-5xl py-8 px-4">
            <h1 className="mb-6 text-3xl font-bold">My Profile</h1>

            <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
            >
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="details">Profile Details</TabsTrigger>
                    <TabsTrigger value="stats">Stats</TabsTrigger>
                    <TabsTrigger value="danger">Danger Zone</TabsTrigger>
                </TabsList>

                <TabsContent value="details">
                    <Card>
                        <CardHeader>
                            <CardTitle>Profile Information</CardTitle>
                            <CardDescription>
                                Update your personal information
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form {...profileForm}>
                                <form
                                    onSubmit={profileForm.handleSubmit(
                                        onProfileSubmit,
                                    )}
                                    className="space-y-6"
                                >
                                    <div className="flex gap-6 items-start">
                                        <AvatarUpload
                                            currentAvatarUrl={
                                                avatarPreview ||
                                                user.profile.avatarUrl
                                            }
                                            userName={user.profile.name}
                                            onFileSelect={handleAvatarSelect}
                                            maxSizeMB={2}
                                            disabled={isUpdating}
                                        />

                                        <div className="flex-1 space-y-2">
                                            <p className="text-sm font-medium">
                                                {selectedFile
                                                    ? "New photo selected"
                                                    : "Click avatar to change photo"}
                                            </p>

                                            {(selectedFile ||
                                                user.profile.avatarUrl) && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={async () => {
                                                        if (selectedFile) {
                                                            setSelectedFile(
                                                                null,
                                                            );
                                                            setAvatarPreview(
                                                                null,
                                                            );
                                                        } else {
                                                            setIsUpdating(true);
                                                            try {
                                                                await apiFetch(
                                                                    "/me",
                                                                    {
                                                                        method: "PATCH",
                                                                        body: {
                                                                            name: user
                                                                                .profile
                                                                                .name,
                                                                            avatarUrl: null,
                                                                        },
                                                                    },
                                                                );

                                                                toast.success(
                                                                    "Avatar removed successfully",
                                                                );
                                                                await mutate();
                                                            } catch (error) {
                                                                console.error(
                                                                    "Remove avatar error:",
                                                                    error,
                                                                );
                                                                toast.error(
                                                                    error instanceof ApiError
                                                                        ? error.message
                                                                        : "Failed to remove avatar",
                                                                );
                                                            } finally {
                                                                setIsUpdating(
                                                                    false,
                                                                );
                                                            }
                                                        }
                                                    }}
                                                    className="mt-2"
                                                    disabled={isUpdating}
                                                >
                                                    <X className="mr-2 h-4 w-4" />
                                                    {selectedFile
                                                        ? "Cancel"
                                                        : "Remove Photo"}
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    
                                    <FormField
                                        control={profileForm.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Name</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="John Doe"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />


                                    <div className="space-y-2">
                                        <FormLabel>Email</FormLabel>
                                        <Input
                                            value={user.email || ""}
                                            disabled
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Email cannot be changed
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <FormLabel>Profile code</FormLabel>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                value={friendCode ?? ""}
                                                readOnly
                                                placeholder="— — — —"
                                                className="font-mono tracking-widest"
                                            />
                                            {friendCode && (
                                                <CopyButton text={friendCode} />
                                            )}
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={onRegenerateFriendCode}
                                                disabled={isRegeneratingCode}
                                            >
                                                {isRegeneratingCode ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : null}
                                                Change
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Share this 8-digit code with a friend so
                                            they can invite you to a 1v1 battle.
                                            Changing it invalidates the old one.
                                        </p>
                                    </div>

                                    <Button type="submit" disabled={isUpdating}>
                                        {isUpdating ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Updating...
                                            </>
                                        ) : (
                                            "Update Profile"
                                        )}
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="stats">
                    <div className="space-y-4">
                        <XpProgress />
                        <ProfileBadgesCard />
                    </div>
                </TabsContent>

                <TabsContent value="danger">
                    <Card>
                        <CardHeader>
                            <CardTitle>Delete Account</CardTitle>
                            <CardDescription>
                                Permanently delete your account and all
                                associated data
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                                    <h3 className="font-semibold text-destructive">
                                        Warning
                                    </h3>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        This action cannot be undone. This will
                                        permanently delete your account and
                                        remove your data from our servers.
                                    </p>
                                </div>

                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive">
                                            Delete My Account
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>
                                                Are you absolutely sure?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This action cannot be undone.
                                                Please enter your password to
                                                confirm account deletion.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>

                                        <Form {...deleteAccountForm}>
                                            <form
                                                onSubmit={deleteAccountForm.handleSubmit(
                                                    handleDeleteAccount,
                                                )}
                                            >
                                                <FormField
                                                    control={
                                                        deleteAccountForm.control
                                                    }
                                                    name="password"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>
                                                                Password
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    type="password"
                                                                    placeholder="Enter your password"
                                                                    {...field}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <AlertDialogFooter className="mt-4">
                                                    <AlertDialogCancel>
                                                        Cancel
                                                    </AlertDialogCancel>
                                                    <AlertDialogAction
                                                        type="submit"
                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        disabled={isDeleting}
                                                    >
                                                        {isDeleting ? (
                                                            <>
                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                Deleting...
                                                            </>
                                                        ) : (
                                                            "Delete Account"
                                                        )}
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </form>
                                        </Form>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
};


function ProfileBadgesCard() {
    const { badges, isLoading } = useBadges();
    const earned = badges.filter((b) => b.earned).length;
    return (
        <Card>
            <CardHeader>
                <CardTitle>Badges</CardTitle>
                <CardDescription>
                    {isLoading
                        ? 'Loading…'
                        : `${earned} of ${badges.length} earned`}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? null : badges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No badges available yet.
                    </p>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {badges.map((b) => (
                            <BadgeCard key={b.id} badge={b} />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default ProfilePage;