import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the repository module before importing the service ─────────────────

const mockFindOne = vi.fn();
const mockFindByUser = vi.fn().mockResolvedValue([]);
const mockUpsert = vi.fn();

vi.mock(
  "../../src/modules/notifications/notification-preference.repository.js",
  () => ({
    notificationPreferenceRepository: {
      findOne: mockFindOne,
      findByUser: mockFindByUser,
      upsert: mockUpsert,
    },
    NotificationPreferenceRepository: class {},
  }),
);

// Import after mocking so the module resolves the mock
const { NotificationPreferenceService } = await import(
  "../../src/modules/notifications/notification-preference.service.js"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePref(overrides: Record<string, unknown> = {}) {
  return {
    id: "pref_1",
    userId: "user_1",
    orgId: "org_1",
    type: "INVOICE_OVERDUE",
    inAppEnabled: true,
    emailEnabled: true,
    whatsappEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("NotificationPreferenceService", () => {
  let service: InstanceType<typeof NotificationPreferenceService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NotificationPreferenceService();
  });

  describe("isEmailEnabled — opt-in default behaviour", () => {
    it("returns true when no preference row exists (opt-in default)", async () => {
      mockFindOne.mockResolvedValue(null);
      const result = await service.isEmailEnabled("user_1", "org_1", "INVOICE_OVERDUE");
      expect(result).toBe(true);
    });

    it("returns true when preference row has emailEnabled=true", async () => {
      mockFindOne.mockResolvedValue(makePref({ emailEnabled: true }));
      const result = await service.isEmailEnabled("user_1", "org_1", "INVOICE_OVERDUE");
      expect(result).toBe(true);
    });

    it("returns false when user has opted out of email for a type", async () => {
      mockFindOne.mockResolvedValue(makePref({ emailEnabled: false }));
      const result = await service.isEmailEnabled("user_1", "org_1", "INVOICE_OVERDUE");
      expect(result).toBe(false);
    });
  });

  describe("isWhatsAppEnabled — opt-in default behaviour", () => {
    it("returns true when no preference row exists (opt-in default)", async () => {
      mockFindOne.mockResolvedValue(null);
      const result = await service.isWhatsAppEnabled("user_1", "org_1", "TASK_OVERDUE");
      expect(result).toBe(true);
    });

    it("returns true when preference row has whatsappEnabled=true", async () => {
      mockFindOne.mockResolvedValue(makePref({ type: "TASK_OVERDUE", whatsappEnabled: true }));
      const result = await service.isWhatsAppEnabled("user_1", "org_1", "TASK_OVERDUE");
      expect(result).toBe(true);
    });

    it("returns false when user has opted out of WhatsApp for a type", async () => {
      mockFindOne.mockResolvedValue(makePref({ type: "TASK_OVERDUE", whatsappEnabled: false }));
      const result = await service.isWhatsAppEnabled("user_1", "org_1", "TASK_OVERDUE");
      expect(result).toBe(false);
    });
  });

  describe("updatePreference", () => {
    it("calls upsert with only email and whatsapp channels (not inApp)", async () => {
      const updated = makePref({ emailEnabled: false });
      mockUpsert.mockResolvedValue(updated);

      const result = await service.updatePreference("user_1", "org_1", "INVOICE_OVERDUE", {
        emailEnabled: false,
      });

      expect(mockUpsert).toHaveBeenCalledWith("user_1", "org_1", "INVOICE_OVERDUE", {
        emailEnabled: false,
      });
      expect(result).toBe(updated);
    });
  });
});
