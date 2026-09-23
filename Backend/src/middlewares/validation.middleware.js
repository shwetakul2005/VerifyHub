const { z } = require("zod");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "A valid MongoDB ID is required.");
const shortText = z.string().trim().min(1).max(120);

function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: "Request validation failed.",
                errors: result.error.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message
                }))
            });
        }

        req.body = result.data;
        next();
    };
}

const schemas = {
    register: z.object({
        username: z.string().trim().min(2).max(80),
        email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
        password: z.string().min(8).max(128)
    }).strict(),

    login: z.object({
        email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
        password: z.string().min(1).max(128)
    }).strict(),

    organizationCreate: z.object({
        name: z.string().trim().min(2).max(120)
    }).strict(),

    workflowCreate: z.object({
        name: shortText,
        organization: objectId,
        description: z.string().trim().max(1000).optional(),
        assignedVerifier: objectId
    }).strict(),

    workflowUpdate: z.object({
        name: shortText.optional(),
        description: z.string().trim().max(1000).optional()
    }).strict().refine((value) => Object.keys(value).length > 0, {
        message: "At least one workflow field is required."
    }),

    workflowStepCreate: z.object({
        workflowTemplate: objectId,
        stepOrder: z.number().int().positive(),
        stepType: z.enum(["email", "document", "face_verification"]),
        title: shortText,
        description: z.string().trim().max(1000).optional(),
        isRequired: z.boolean().optional(),
        maxRetries: z.number().int().min(0).max(10).optional(),
        status: z.enum(["active", "inactive"]).optional(),
        config: z.record(z.string(), z.unknown()).optional()
    }).strict(),

    workflowStepUpdate: z.object({
        stepOrder: z.number().int().positive().optional(),
        title: shortText.optional(),
        description: z.string().trim().max(1000).optional(),
        isRequired: z.boolean().optional(),
        maxRetries: z.number().int().min(0).max(10).optional(),
        status: z.enum(["active", "inactive"]).optional(),
        config: z.record(z.string(), z.unknown()).optional()
    }).strict().refine((value) => Object.keys(value).length > 0, {
        message: "At least one workflow-step field is required."
    }),

    verificationRequestCreate: z.object({
        organization: objectId,
        workflowTemplate: objectId,
        applicant: objectId
    }).strict(),

    workflowRetry: z.object({
        idempotencyKey: z.string().trim().min(1).max(120)
    }).strict(),

    workflowCancel: z.object({
        reason: z.string().trim().min(3).max(1000)
    }).strict(),

    documentReject: z.object({
        rejectionReason: z.string().trim().min(3).max(1000)
    }).strict()
};

module.exports = { validateBody, schemas };
