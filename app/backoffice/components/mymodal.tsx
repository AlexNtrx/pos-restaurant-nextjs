import { Children, ReactNode } from "react";

interface ModalProps {
  id: string;
  title: string;
  children: ReactNode;
}

const Modal: React.FC<ModalProps> = ({ id, title, children }) => {
  return (
    <>
      <div className="modal fade" id={id} tabIndex={-1}>
        <div className="modal-dialog">
          <div className="model-content">
            <h5 className="modal-title">{title}</h5>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="moal"
              aria-label="Close"
              id={id + "_btnClose"}
            ></button>
            <div className="modal-body">{children}</div>
          </div>
        </div>
      </div>
    </>
  );
};
