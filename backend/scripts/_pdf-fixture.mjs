


export function buildPdf(text) {
    const content = Buffer.from(`BT /F1 18 Tf 72 700 Td (${text}) Tj ET`, "latin1");
    const objs = [
        Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1"),
        Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "latin1"),
        Buffer.from(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
            "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            "latin1"
        ),
        Buffer.concat([
            Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "latin1"),
            content,
            Buffer.from("\nendstream", "latin1"),
        ]),
        Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "latin1"),
    ];

    const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
    const offsets = [];
    objs.forEach((o, i) => {
        offsets.push(Buffer.concat(chunks).length);
        chunks.push(Buffer.from(`${i + 1} 0 obj\n`, "latin1"), o, Buffer.from("\nendobj\n", "latin1"));
    });
    const xrefOffset = Buffer.concat(chunks).length;

    let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
    xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    chunks.push(Buffer.from(xref, "latin1"));
    return Buffer.concat(chunks);
}

export default { buildPdf };
