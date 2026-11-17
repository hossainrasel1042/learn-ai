"use client";



import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";

import { createCourse } from "@/lib/api/cms";


const COURSE_NO_PATTERN = /^[A-Za-z]{2,4}\d{4}$/;

const newCourseSchema = z.object({
    name: z
        .string()
        .trim()
        .min(10, "Course name must be at least 10 characters")
        .max(100, "Course name must be at most 100 characters"),
    course_no: z
        .string()
        .trim()
        .min(1, "Course number is required")
        .regex(
            COURSE_NO_PATTERN,
            "Course number must be 2–4 letters followed by 4 digits (e.g. CSE1121)"
        ),
    description: z
        .string()
        .trim()
        .max(500, "Description must be at most 500 characters")
        .optional()
        .or(z.literal("")),
});

export type NewCourseValues = z.infer<typeof newCourseSchema>;

interface NewCourseDialogProps {

    onCreated?: () => void;
}

export function NewCourseDialog({ onCreated }: NewCourseDialogProps) {
    const [open, setOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const form = useForm<NewCourseValues>({
        resolver: zodResolver(newCourseSchema),
        defaultValues: { name: "", course_no: "", description: "" },
    });



    React.useEffect(() => {
        if (open) {
            form.reset({ name: "", course_no: "", description: "" });
        }
    }, [open, form]);

    const onSubmit = async (values: NewCourseValues) => {
        setIsSubmitting(true);
        try {
            await createCourse({
                name: values.name.trim(),
                course_no: values.course_no.trim().toUpperCase(),
                description: values.description?.trim() || undefined,
            });
            toast.success("Course created");
            setOpen(false);
            form.reset({ name: "", course_no: "", description: "" });
            onCreated?.();
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Could not create the course"
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="shadow-sm">
                    <Plus className="mr-2 h-4 w-4" /> New Course
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create New Course</DialogTitle>
                    <DialogDescription>
                        Add a new course to the platform.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="grid gap-4 py-4"
                        noValidate
                    >
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Course Name</FormLabel>
                                    <FormControl>
                                        
                                        <Input
                                            placeholder="Introduction to Artificial Intelligence"
                                            disabled={isSubmitting}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="course_no"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Course Number</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="CSE422"
                                            disabled={isSubmitting}



                                            onChange={(e) =>
                                                field.onChange(
                                                    e.target.value
                                                        .replace(/\s+/g, "")
                                                        .toUpperCase()
                                                )
                                            }
                                            onBlur={field.onBlur}
                                            name={field.name}
                                            ref={field.ref}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Description (optional)
                                    </FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="What this course covers"
                                            disabled={isSubmitting}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                aria-busy={isSubmitting}
                            >
                                {isSubmitting ? "Creating…" : "Create Course"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

export default NewCourseDialog;
