using System.Net;
using System.Net.Http.Headers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;
using NineCube.Tests.Infrastructure;

namespace NineCube.Tests;

/// <summary>
/// The image chain end to end: a real multipart upload through the HTTP pipeline, the file on disk,
/// the public url served back, and the database rule that a product has exactly one primary image.
/// </summary>
public sealed class ProductImageUploadTests(ApiFactory factory) : ApiTestBase(factory)
{
    private static readonly byte[] Png = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    private static readonly byte[] Jpeg =
        [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9];

    private static readonly byte[] Webp =
        [.. "RIFF"u8, 0x1A, 0x00, 0x00, 0x00, .. "WEBP"u8, .. "VP8 "u8, .. new byte[20]];

    private async Task<(Product Product, string Token)> PreparedAsync(string email)
    {
        var token = (await SeedAndLoginAsync(email, UserRole.InventoryManager)).Token;
        var product = await SeedProductAsync("MEDIA-1", 1_200m, 3);
        return (product, token);
    }

    private async Task<HttpResponseMessage> UploadAsync(int productId, string fileName, byte[] bytes, string contentType, string token)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);

        var form = new MultipartFormDataContent();
        form.Add(file, "file", fileName);

        var request = Request(HttpMethod.Post, $"api/products/{productId}/images", null, token);
        request.Content = form;
        return await Client.SendAsync(request);
    }

    private async Task<List<ProductImageDto>> GalleryAsync(int productId, string token) =>
        await ReadAsync<List<ProductImageDto>>(await GetAsync($"api/products/{productId}/images", token));

    private IProductStorage Storage => Factory.Services.GetRequiredService<IProductStorage>();

    [Fact]
    public async Task Upload_stores_the_file_and_the_public_url_serves_the_image_back()
    {
        var (product, token) = await PreparedAsync("media-upload@example.com");

        var response = await UploadAsync(product.Id, "photo.png", Png, "image/png", token);
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var image = await ReadAsync<ProductImageDto>(response);
        image.Url.Should().StartWith("/uploads/");
        image.IsPrimary.Should().BeTrue("the first image of a product is its primary one");
        image.AltText.Should().Be(product.Name);

        // The file really exists on disk, under the storage folder rather than the build output.
        (await Storage.ExistsAsync(image.Url)).Should().BeTrue();
        File.Exists(Path.Combine(Storage.RootPath, Path.GetFileName(image.Url))).Should().BeTrue();
        Storage.RootPath.Should().NotContain($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}",
            "uploaded media has to survive a rebuild or a restart");

        var served = await Client.GetAsync(image.Url);
        served.StatusCode.Should().Be(HttpStatusCode.OK);
        served.Content.Headers.ContentType?.MediaType.Should().Be("image/png");
        (await served.Content.ReadAsByteArrayAsync()).Should().Equal(Png);

        // The catalogue card reads the same url through Product.ImageUrl.
        var listed = await ReadAsync<PagedResult<ProductDto>>(await GetAsync("api/products?q=MEDIA-1", token));
        listed.Items.Single().ImageUrl.Should().Be(image.Url);
        listed.Items.Single().Images.Should().NotBeNull().And.HaveCount(1);
    }

    [Theory]
    [InlineData("photo.jpg", "image/jpeg", ".jpg")]
    [InlineData("photo.webp", "image/webp", ".webp")]
    public async Task Every_supported_format_is_stored_with_its_own_extension(string fileName, string contentType, string extension)
    {
        var (product, token) = await PreparedAsync($"media-{extension.Trim('.')}@example.com");
        var bytes = contentType == "image/jpeg" ? Jpeg : Webp;

        var response = await UploadAsync(product.Id, fileName, bytes, contentType, token);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var image = await ReadAsync<ProductImageDto>(response);
        image.Url.Should().EndWith(extension);
        (await Client.GetAsync(image.Url)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Non_images_truncated_files_and_oversize_payloads_are_rejected_before_they_touch_disk()
    {
        var (product, token) = await PreparedAsync("media-reject@example.com");
        var before = Directory.GetFiles(Storage.RootPath).Length;

        var cases = new (string Name, byte[] Bytes, string Type)[]
        {
            ("notes.txt", "hello world, definitely not a picture"u8.ToArray(), "text/plain"),
            ("truncated.png", [0x89, 0x50, 0x4E], "image/png"),
            ("huge.png", Png.Concat(new byte[5 * 1024 * 1024]).ToArray(), "image/png"),
            ("empty.png", [], "image/png")
        };

        foreach (var (name, bytes, type) in cases)
        {
            var response = await UploadAsync(product.Id, name, bytes, type, token);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest, $"{name} must not be accepted");
            (await ReadJsonAsync(response)).GetProperty("code").GetString().Should().Be("invalid_request");
        }

        Directory.GetFiles(Storage.RootPath).Should().HaveCount(before, "a rejected upload stores nothing");
        (await GalleryAsync(product.Id, token)).Should().BeEmpty();
    }

    [Fact]
    public async Task A_customer_cannot_upload_and_an_unknown_product_is_404()
    {
        var (product, _) = await PreparedAsync("media-owner@example.com");
        var customerToken = (await SeedAndLoginAsync("media-customer@example.com", UserRole.Customer)).Token;

        (await UploadAsync(product.Id, "photo.png", Png, "image/png", customerToken))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await UploadAsync(999_999, "photo.png", Png, "image/png",
            (await SeedAndLoginAsync("media-admin@example.com", UserRole.InventoryManager)).Token))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Exactly_one_image_is_primary_and_promotion_moves_it()
    {
        var (product, token) = await PreparedAsync("media-primary@example.com");

        var first = await ReadAsync<ProductImageDto>(await UploadAsync(product.Id, "one.png", Png, "image/png", token));
        var second = await ReadAsync<ProductImageDto>(await UploadAsync(product.Id, "two.png", Jpeg, "image/jpeg", token));

        var gallery = await GalleryAsync(product.Id, token);
        gallery.Should().HaveCount(2);
        gallery.Count(i => i.IsPrimary).Should().Be(1);
        gallery[0].Id.Should().Be(first.Id, "the gallery lists the primary image first");

        var promoted = await ReadAsync<ProductDto>(await PutAsync($"api/products/{product.Id}/images/{second.Id}/primary", null, token));
        promoted.ImageUrl.Should().Be(second.Url);

        gallery = await GalleryAsync(product.Id, token);
        gallery.Count(i => i.IsPrimary).Should().Be(1);
        gallery.Single(i => i.IsPrimary).Id.Should().Be(second.Id);

        // The filtered unique index refuses a second primary row, so no code path can create one.
        var violation = await Assert.ThrowsAnyAsync<Exception>(() => Factory.WithDbAsync(async db =>
        {
            db.ProductImages.Add(new ProductImage { ProductId = product.Id, Url = "/uploads/extra.png", IsPrimary = true, CreatedAt = DateTime.UtcNow });
            return await db.SaveChangesAsync();
        }));

        violation.Should().BeOfType<DbUpdateException>();
        (await GalleryAsync(product.Id, token)).Count(i => i.IsPrimary).Should().Be(1);
    }

    [Fact]
    public async Task Deleting_the_primary_image_promotes_the_next_and_removes_the_stored_file()
    {
        var (product, token) = await PreparedAsync("media-delete@example.com");

        var first = await ReadAsync<ProductImageDto>(await UploadAsync(product.Id, "one.png", Png, "image/png", token));
        var second = await ReadAsync<ProductImageDto>(await UploadAsync(product.Id, "two.png", Jpeg, "image/jpeg", token));

        var after = await ReadAsync<ProductDto>(await DeleteAsync($"api/products/{product.Id}/images/{first.Id}", token));

        (await Storage.ExistsAsync(first.Url)).Should().BeFalse("the file of a deleted image is removed");
        after.ImageUrl.Should().Be(second.Url);

        var gallery = await GalleryAsync(product.Id, token);
        gallery.Should().HaveCount(1);
        gallery.Single().IsPrimary.Should().BeTrue();

        // Deleting the last image leaves the product without a picture, which the card renders as a placeholder.
        after = await ReadAsync<ProductDto>(await DeleteAsync($"api/products/{product.Id}/images/{second.Id}", token));
        after.ImageUrl.Should().BeNull();
        (await GalleryAsync(product.Id, token)).Should().BeEmpty();
        (await Client.GetAsync(second.Url)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Clearing_the_image_url_on_the_product_removes_the_gallery_it_mirrored()
    {
        var (product, token) = await PreparedAsync("media-sync@example.com");
        var image = await ReadAsync<ProductImageDto>(await UploadAsync(product.Id, "one.png", Png, "image/png", token));

        var cleared = await ReadAsync<ProductDto>(await PutAsync($"api/products/{product.Id}",
            new UpdateProductRequest(product.Name, product.Price, true, null, string.Empty), token));

        cleared.ImageUrl.Should().BeNullOrEmpty();
        (await GalleryAsync(product.Id, token)).Should().BeEmpty();
        (await Storage.ExistsAsync(image.Url)).Should().BeFalse();
    }
}
