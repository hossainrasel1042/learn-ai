'use client';



import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CourseCodeSelect } from '@/components/common/CourseCodeSelect';
import { lookupCourseByCode, type PickerCourse } from '@/lib/api/course-picker';

export interface CourseSourcePickerProps {
    value: string;
    onChange: (sourceId: string) => void;
    disabled?: boolean;
}

export function CourseSourcePicker({
    value,
    onChange,
    disabled,
}: CourseSourcePickerProps) {
    const [picked, setPicked] = useState<PickerCourse | null>(null);
    const [uuidInput, setUuidInput] = useState(value || '');

    return (
        <div className="space-y-2">
            <Label>Source</Label>
            <Tabs defaultValue="picker">
                <TabsList>
                    <TabsTrigger value="picker">By code</TabsTrigger>
                    <TabsTrigger value="uuid">Paste UUID</TabsTrigger>
                </TabsList>
                <TabsContent value="picker" className="pt-2">
                    <CourseCodeSelect
                        value={picked}
                        onChange={(c) => {
                            setPicked(c);
                            if (c) onChange(c.id);
                        }}
                        disabled={disabled}
                    />
                    {picked && (
                        <p className="mt-2 text-xs text-muted-foreground">
                            Selected: <span className="font-mono">{picked.code}</span> ({picked.name})
                        </p>
                    )}
                </TabsContent>
                <TabsContent value="uuid" className="pt-2">
                    <Input
                        value={uuidInput}
                        onChange={async (e) => {
                            const v = e.target.value;
                            setUuidInput(v);

                            onChange(v);

                            if (v && !/^[0-9a-f-]{36}$/i.test(v)) {
                                try {
                                    const c = await lookupCourseByCode(v);
                                    onChange(c.id);
                                    setPicked(c);
                                } catch (_) {  }
                            }
                        }}
                        placeholder="Paste the course UUID or code (e.g. cse1121-02-A3F2)"
                        disabled={disabled}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default CourseSourcePicker;