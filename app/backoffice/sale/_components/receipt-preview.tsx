import MyModal from "../../components/mymodal";

type ReceiptPreviewProps = {
  billUrl: string;
  // Manages receipt preview while preserving cleanup behavior.
};

// Manages receipt preview while preserving cleanup behavior.
export default function ReceiptPreview({ billUrl }: ReceiptPreviewProps) {
  return (
    <>
      <button
        id="btnPrint"
        style={{ display: "none" }}
        data-bs-toggle="modal"
        data-bs-target="#modalPrint"
      ></button>
      <MyModal id="modalPrint" title="Receipt Preview" modalSize="">
        {billUrl && (
          <iframe
            src={billUrl}
            title="Receipt PDF"
            width="100%"
            height="600px"
          ></iframe>
        )}
      </MyModal>
    </>
  );
}
