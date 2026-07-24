import type { Course, Lesson, VendorCourseProgress } from "../types";
import { httpRequest } from "./http";

export type ApiCourseList = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  category: string | null;
  cover_image_url: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  _count?: { lessons: number };
};

export type ApiCourseDetail = ApiCourseList & {
  lessons: Array<{
    id: string;
    course_id: string;
    title: string;
    video_url: string | null;
    content_text: string | null;
    display_order: number;
    duration_minutes: number;
    created_at: string;
  }>;
};

export type ApiProgressRow = {
  id: string;
  vendor_id: string;
  course_id: string;
  lesson_id: string;
  completed: boolean;
  completed_at: string | null;
  score: number | null;
  course: { id: string; name: string };
  lesson: { id: string; title: string; display_order: number };
};

export function listCourses(token: string) {
  return httpRequest<ApiCourseList[]>("/courses", { method: "GET", token });
}

export function getCourse(id: string, token: string) {
  return httpRequest<ApiCourseDetail>(`/courses/${id}`, {
    method: "GET",
    token,
  });
}

export function myCourseProgress(token: string) {
  return httpRequest<ApiProgressRow[]>("/courses/progress/me", {
    method: "GET",
    token,
  });
}

export function vendorCourseProgress(vendorId: string, token: string) {
  const qs = new URLSearchParams({ vendor_id: vendorId });
  return httpRequest<ApiProgressRow[]>(
    `/courses/progress/vendor?${qs.toString()}`,
    {
      method: "GET",
      token,
    },
  );
}

export function patchLessonProgress(
  courseId: string,
  lessonId: string,
  completed: boolean,
  token: string,
) {
  return httpRequest<unknown>(
    `/courses/${courseId}/lessons/${lessonId}/progress`,
    {
      method: "PATCH",
      token,
      body: { completed },
    },
  );
}

export function mapApiCourseToCourse(
  row: ApiCourseDetail | ApiCourseList,
): Course {
  const lessons: Lesson[] =
    "lessons" in row
      ? [...row.lessons]
          .sort((a, b) => a.display_order - b.display_order)
          .map((l) => ({
            id: l.id,
            title: l.title,
            duration_min: l.duration_minutes,
            video_url: l.video_url ?? "",
          }))
      : [];
  const total = row._count?.lessons ?? lessons.length;
  return {
    id: row.id,
    title: row.name,
    description: row.description ?? "",
    cover_url: row.cover_image_url,
    lessons,
    total_lessons: total || lessons.length || 1,
  };
}

export function progressToVendorSummary(
  rows: ApiProgressRow[],
  courseId: string,
): VendorCourseProgress | null {
  const forCourse = rows.filter((r) => r.course_id === courseId);
  if (!forCourse.length) return null;
  const completed = forCourse.filter((r) => r.completed).length;
  const last = forCourse.reduce((a, b) => {
    const t = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return t > a ? t : a;
  }, 0);
  return {
    vendor_id: forCourse[0].vendor_id,
    course_id: courseId,
    completed_lessons: completed,
    last_access: last ? new Date(last).toISOString() : new Date().toISOString(),
    score: forCourse.find((r) => r.score != null)?.score ?? 0,
  };
}
