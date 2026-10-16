-- One-time, repeat-safe customer inbox backfill. No orders or inventory writes.
-- Run with sqlcmd -S <server> -d <database> -E -b -i scripts/backfill-notifications.sql
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN TRANSACTION;
DECLARE @lock int;
EXEC @lock=sp_getapplock @Resource='NineCube.NotificationBackfill',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=15000;
IF @lock<0 THROW 51000,'Notification backfill is busy',1;
DECLARE @events TABLE(UserId int,Type nvarchar(32),Title nvarchar(200),Body nvarchar(500),Link nvarchar(300),CreatedAt datetime2,Status nvarchar(32));
INSERT @events
SELECT u.Id,'OrderPlaced',CONCAT('Order #',o.Id,' placed'),
  CONCAT('Your order #',o.Id,' was placed. This notification was recovered from the order record.'),
  CONCAT('/orders/',o.Id),o.CreatedAt,NULL
FROM Orders o JOIN Users u ON u.CustomerId=o.CustomerId AND u.Role='Customer';
INSERT @events
SELECT u.Id,CASE WHEN o.Status IN ('Cancelled','Rejected') THEN 'OrderCancelled' ELSE 'OrderStatusChanged' END,
  CONCAT('Order #',o.Id,' ',LOWER(o.Status)),
  CONCAT('Order #',o.Id,' is ',LOWER(o.Status),'. Recovered current status; intermediate event history is unavailable.'),
  CONCAT('/orders/',o.Id),o.UpdatedAt,o.Status
FROM Orders o JOIN Users u ON u.CustomerId=o.CustomerId AND u.Role='Customer'
WHERE o.Status<>'Pending';
INSERT Notifications(UserId,Type,Title,Body,Link,IsRead,CreatedAt,ReadAt)
SELECT e.UserId,e.Type,e.Title,e.Body,e.Link,0,e.CreatedAt,NULL FROM @events e
WHERE NOT EXISTS(SELECT 1 FROM Notifications n WITH(UPDLOCK,HOLDLOCK)
  WHERE n.UserId=e.UserId AND n.Type=e.Type AND n.Link=e.Link
  AND (e.Status IS NULL OR LOWER(CONCAT(n.Title,' ',n.Body)) LIKE CONCAT('%',LOWER(e.Status),'%')));
DECLARE @inserted int=@@ROWCOUNT;
COMMIT;
SELECT @inserted AS NotificationsInserted FOR JSON PATH;
