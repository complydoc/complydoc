QUICK_WIN_ASSISTANT_PROMPT = """
<report>
    {audit_report}
<report/>

Based on the given report, draft a set of quick wins that will help the user in understanding where
he needs to head in order to have documents that have better readiness scores.
Also, understand the loaders that were used and if a best loader is
identified draft that as a quick win to be followed.
"""
