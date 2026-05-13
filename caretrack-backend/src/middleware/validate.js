/**
 * Request validation middleware backed by zod.
 *
 * Usage: router.post("/x", validate({ body: BodySchema }), handler)
 *
 * Returns 400 with a structured list of issues on failure. On success, the
 * parsed (and coerced/stripped) values replace req.body / req.params /
 * req.query.
 */
function validate(schemas) {
  return (req, res, next) => {
    try {
      for (const key of ["body", "params", "query"]) {
        if (schemas[key]) {
          const result = schemas[key].safeParse(req[key]);
          if (!result.success) {
            return res.status(400).json({
              error: "Request validation failed.",
              issues: result.error.issues.map((i) => ({
                location: key,
                path: i.path.join("."),
                message: i.message,
              })),
            });
          }
          req[key] = result.data;
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { validate };
