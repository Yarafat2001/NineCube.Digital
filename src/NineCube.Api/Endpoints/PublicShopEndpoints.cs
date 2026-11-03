using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Domain;

namespace NineCube.Api.Endpoints;

/// <summary>Server-rendered product documents for crawlers and shoppers without JavaScript.</summary>
public sealed class PublicShopEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/shop/products/{slug}", async (string slug, HttpRequest request, IConfiguration config, IAppDbContext db, CancellationToken ct) =>
        {
            var product = await db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Slug == slug && p.IsActive, ct)
                ?? throw new NotFoundException("Product was not found.");
            var url = BaseUrl(request, config) + "/shop/products/" + Uri.EscapeDataString(product.Slug);
            var image = ImageUrl(product.ImageUrl, BaseUrl(request, config));
            var structured = JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                ["@context"] = "https://schema.org", ["@type"] = "Product", ["name"] = product.Name,
                ["sku"] = product.Sku, ["description"] = product.Description, ["image"] = image,
                ["offers"] = new Dictionary<string, object> { ["@type"] = "Offer", ["url"] = url,
                    ["priceCurrency"] = product.Currency, ["price"] = product.Price,
                    ["availability"] = product.StockQuantity > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" }
            });
            var store = config["Storefront:Url"];
            var shopLink = Uri.TryCreate(store, UriKind.Absolute, out var storefront) && storefront.Scheme is "https" or "http"
                ? $"<a class=button href='{E(storefront.AbsoluteUri.TrimEnd('/') + "/#/products/" + product.Id)}'>View options and buy</a>" : "";
            var body = $"<a href='/shop'>← Catalogue</a><article><div>{(image is null ? "" : $"<img src='{E(image)}' alt='{E(product.Name)}' width='600' height='600'>")}</div><div><p>NineCube.Digital</p><h1>{E(product.Name)}</h1><p class=price>{E(product.Currency)} {product.Price.ToString("N2", CultureInfo.InvariantCulture)}</p><p>{(product.StockQuantity > 0 ? "Available" : "Currently out of stock")}</p><p>{E(product.Description)}</p>{shopLink}</div></article>";
            return Results.Content(Document(product.Name, url, body, structured), "text/html; charset=utf-8");
        }).AllowAnonymous();

        app.MapGet("/shop", async (HttpRequest request, IConfiguration config, IAppDbContext db, int? page, CancellationToken ct) =>
        {
            var currentPage = Math.Clamp(page ?? 1, 1, 10000);
            var products = await db.Products.AsNoTracking().Where(p => p.IsActive).OrderBy(p => p.Name).ThenBy(p => p.Id)
                .Skip((currentPage - 1) * 100).Take(101).Select(p => new { p.Slug, p.Name, p.Price, p.Currency }).ToListAsync(ct);
            var entries = string.Join("", products.Take(100).Select(p => $"<li><a href='/shop/products/{E(Uri.EscapeDataString(p.Slug))}'>{E(p.Name)}</a><p>{E(p.Currency)} {p.Price.ToString("N2", CultureInfo.InvariantCulture)}</p></li>"));
            var next = products.Count > 100 ? $"<a href='/shop?page={currentPage + 1}'>Next page →</a>" : "";
            return Results.Content(Document("Catalogue", BaseUrl(request, config) + "/shop" + (currentPage > 1 ? $"?page={currentPage}" : ""),
                $"<h1>NineCube.Digital catalogue</h1><ul>{entries}</ul>{next}", null), "text/html; charset=utf-8");
        }).AllowAnonymous();

        app.MapGet("/sitemap.xml", async (HttpRequest request, IConfiguration config, IAppDbContext db, CancellationToken ct) =>
        {
            var products = await db.Products.AsNoTracking().Where(p => p.IsActive).OrderBy(p => p.Id).Take(49999)
                .Select(p => new { p.Slug, p.UpdatedAt }).ToListAsync(ct);
            XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
            var root = BaseUrl(request, config);
            var document = new XDocument(new XElement(ns + "urlset", new XElement(ns + "url", new XElement(ns + "loc", root + "/shop")),
                products.Select(p => new XElement(ns + "url", new XElement(ns + "loc", root + "/shop/products/" + Uri.EscapeDataString(p.Slug)),
                    new XElement(ns + "lastmod", p.UpdatedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture))))));
            return Results.Content(document.ToString(), "application/xml; charset=utf-8");
        }).AllowAnonymous();
    }

    private static string E(string? value) => WebUtility.HtmlEncode(value ?? "");
    private static string BaseUrl(HttpRequest request, IConfiguration config) =>
        (config["Storefront:PublicApiUrl"] ?? $"{request.Scheme}://{request.Host}").TrimEnd('/');
    private static string? ImageUrl(string? image, string root)
    {
        if (string.IsNullOrWhiteSpace(image)) return null;
        if (image.StartsWith('/') && !image.StartsWith("//")) return root + image;
        return Uri.TryCreate(image, UriKind.Absolute, out var uri) && uri.Scheme is "https" or "http" ? uri.AbsoluteUri : null;
    }
    private static string Document(string title, string canonical, string body, string? structured) => $"""
        <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>{E(title)} | NineCube.Digital</title><link rel="canonical" href="{E(canonical)}">
        <meta property="og:title" content="{E(title)}"><meta property="og:url" content="{E(canonical)}">
        <style>{Style}</style>
        {(structured is null ? "" : $"<script type='application/ld+json'>{structured}</script>")}</head><body><main>{body}</main></body></html>
        """;
    private const string Style = "body{font:17px/1.6 system-ui,sans-serif;background:#f6f7f9;color:#17202e;margin:0;padding:clamp(20px,5vw,72px)}main{max-width:1100px;margin:auto}a{color:#984309}article{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:40px;margin-top:32px}img{width:100%;height:auto;object-fit:contain;background:white;border-radius:20px}h1{line-height:1.2;font-size:clamp(28px,4vw,48px)}.price{font-size:26px;font-weight:700}.button{display:inline-block;background:#984309;color:white;padding:12px 24px;border-radius:12px;text-decoration:none}li{background:white;padding:20px;border-radius:12px;margin:12px 0;list-style:none}ul{padding:0}";
}
